import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HotelScope } from '../auth/hotel-context';

export interface VendorSummary {
  id: string;
  name: string | null;
  contactEmail: string | null;
  onboarded: boolean;
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
      createdAt: vendor.createdAt,
    }));
    const known = new Set(vendors.map((vendor) => vendor.id));
    for (const { vendorId } of payoutVendors) {
      if (!known.has(vendorId)) {
        result.push({ id: vendorId, name: null, contactEmail: null, onboarded: false, createdAt: null });
      }
    }
    return result;
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

  async onboard(name: string, contactEmail?: string, hotelId?: string) {
    return this.prisma.vendor.create({ data: { name, contactEmail, hotelId } });
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
