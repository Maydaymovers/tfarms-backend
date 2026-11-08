import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma, VendorStatus } from '@prisma/client';
import { canTransition } from './vendor-status';
import { PrismaService } from '../prisma/prisma.service';
import { HotelScope } from '../auth/hotel-context';

export interface VendorSummary {
  id: string;
  name: string | null;
  contactEmail: string | null;
  onboarded: boolean;
  status: VendorStatus | null;
  createdAt: Date | null;
}

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists onboarded vendors plus any vendorId that only appears on payouts.
   */
  async findAll(scope: HotelScope = {}): Promise<VendorSummary[]> {
    const [vendors, payoutVendors] = await Promise.all([
      this.prisma.vendor.findMany({ where: { ...scope }, orderBy: { createdAt: 'desc' } }),
      this.prisma.payout.findMany({ where: { ...scope }, distinct: ['vendorId'], select: { vendorId: true } }),
    ]);

    const result: VendorSummary[] = vendors.map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      contactEmail: vendor.contactEmail,
      onboarded: true,
      status: vendor.status,
      createdAt: vendor.createdAt,
    }));
    const known = new Set(vendors.map((vendor) => vendor.id));
    for (const { vendorId } of payoutVendors) {
      if (!known.has(vendorId)) {
        result.push({ id: vendorId, name: null, contactEmail: null, onboarded: false, status: null, createdAt: null });
      }
    }
    return result;
  }

  /** Vendors with no hotel yet, oldest first: the platform review queue. Service requests only. */
  async findUnassigned() {
    const vendors = await this.prisma.vendor.findMany({
      where: { hotelId: null },
      orderBy: { createdAt: 'asc' },
    });
    return vendors.map((v) => ({
      vendorId: v.id,
      businessName: v.name,
      email: v.contactEmail,
      status: v.status,
      hotelId: null,
      createdAt: v.createdAt,
    }));
  }

  /** Number of vendors in the caller's hotel (all vendors for service requests). */
  async count(scope: HotelScope = {}): Promise<{ count: number }> {
    return { count: await this.prisma.vendor.count({ where: { ...scope } }) };
  }

  /**
   * Assigns an existing vendor, and its still-unassigned payouts and ledger
   * entries, to a hotel. Service requests only.
   */
  async assignToHotel(vendorId: string, hotelId: string) {
    const [vendor, hotel] = await Promise.all([
      this.prisma.vendor.findUnique({ where: { id: vendorId } }),
      this.prisma.hotel.findUnique({ where: { id: hotelId } }),
    ]);
    if (!vendor) throw new NotFoundException(`Vendor ${vendorId} not found`);
    if (!hotel) throw new NotFoundException(`Hotel ${hotelId} not found`);
    if (vendor.hotelId && vendor.hotelId !== hotelId) {
      throw new ConflictException('Vendor already belongs to another hotel');
    }
    const [updated, payouts, ledger] = await this.prisma.$transaction([
      this.prisma.vendor.update({ where: { id: vendorId }, data: { hotelId } }),
      this.prisma.payout.updateMany({ where: { vendorId, hotelId: null }, data: { hotelId } }),
      this.prisma.ledgerEntry.updateMany({ where: { vendorId, hotelId: null }, data: { hotelId } }),
    ]);
    return { vendor: updated, payoutsAssigned: payouts.count, ledgerEntriesAssigned: ledger.count };
  }

  /**
   * Creates a vendor, always as PENDING. With an Idempotency-Key, a repeat of
   * the same request returns the first response instead of creating a second
   * vendor; the same key with a different body is rejected.
   */
  async onboard(name: string, contactEmail?: string, hotelId?: string, idempotencyKey?: string) {
    const data = { name, contactEmail, hotelId, status: VendorStatus.PENDING };
    if (!idempotencyKey) {
      return this.prisma.vendor.create({ data });
    }
    if (idempotencyKey.length > 200) {
      throw new BadRequestException('Idempotency-Key must be at most 200 characters');
    }

    const scope = hotelId ?? 'service';
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ name, contactEmail: contactEmail ?? null, hotelId: hotelId ?? null }))
      .digest('hex');
    const replay = async () => {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { scope_key: { scope, key: idempotencyKey } },
      });
      if (!existing) return null;
      if (existing.requestHash !== requestHash) {
        throw new UnprocessableEntityException('Idempotency-Key was already used with a different request');
      }
      return existing.response;
    };

    const prior = await replay();
    if (prior) return prior;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const vendor = await tx.vendor.create({ data });
        await tx.idempotencyKey.create({
          data: {
            scope,
            key: idempotencyKey,
            requestHash,
            response: JSON.parse(JSON.stringify(vendor)),
          },
        });
        return vendor;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // A concurrent request with the same key won the race.
        const winner = await replay();
        if (winner) return winner;
      }
      throw err;
    }
  }

  async findOne(id: string, scope: HotelScope = {}) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id, ...scope } });
    if (!vendor) throw new NotFoundException(`Vendor ${id} not found`);
    return {
      vendorId: vendor.id,
      businessName: vendor.name,
      email: vendor.contactEmail,
      status: vendor.status,
      hotelId: vendor.hotelId,
      createdAt: vendor.createdAt,
      updatedAt: vendor.updatedAt,
    };
  }

  async statusHistory(id: string, scope: HotelScope = {}) {
    await this.findOne(id, scope);
    return this.prisma.vendorStatusEvent.findMany({
      where: { vendorId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Validates the transition, updates the vendor and writes the audit row together. */
  async changeStatus(
    id: string,
    newStatus: VendorStatus,
    changedBy: string,
    reason: string | undefined,
    scope: HotelScope = {},
  ) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id, ...scope } });
    if (!vendor) throw new NotFoundException(`Vendor ${id} not found`);
    if (!canTransition(vendor.status, newStatus)) {
      throw new ConflictException({
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot change status from ${vendor.status} to ${newStatus}`,
      });
    }
    return this.prisma.$transaction(async (tx) => {
      // Compare-and-set so two concurrent changes cannot both apply.
      const changed = await tx.vendor.updateMany({
        where: { id, status: vendor.status },
        data: { status: newStatus },
      });
      if (changed.count !== 1) {
        throw new ConflictException({
          statusCode: 409,
          code: 'INVALID_STATUS_TRANSITION',
          message: 'Vendor status changed concurrently; reload and try again',
        });
      }
      await tx.vendorStatusEvent.create({
        data: {
          vendorId: id,
          hotelId: vendor.hotelId,
          oldStatus: vendor.status,
          newStatus,
          changedBy,
          reason,
        },
      });
      return { vendorId: id, oldStatus: vendor.status, status: newStatus };
    });
  }

  async getHealth(vendorId: string, scope: HotelScope = {}) {
    const [vendor, grouped, latest] = await Promise.all([
      this.prisma.vendor.findFirst({ where: { id: vendorId, ...scope } }),
      this.prisma.payout.groupBy({ by: ['status'], where: { vendorId, ...scope }, _count: { _all: true } }),
      this.prisma.payout.findFirst({
        where: { vendorId, ...scope },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    if (!vendor && !latest) {
      throw new NotFoundException(`Vendor ${vendorId} not found`);
    }

    const payoutsByStatus: Record<string, number> = {};
    let payoutCount = 0;
    for (const row of grouped) {
      payoutsByStatus[row.status] = row._count._all;
      payoutCount += row._count._all;
    }

    return {
      vendorId,
      name: vendor?.name ?? null,
      onboarded: Boolean(vendor),
      payoutCount,
      payoutsByStatus,
      lastPayoutAt: latest?.createdAt ?? null,
    };
  }
}
