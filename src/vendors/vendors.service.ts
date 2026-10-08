import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  async findAll(): Promise<VendorSummary[]> {
    const [vendors, payoutVendors] = await Promise.all([
      this.prisma.vendor.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.payout.findMany({ distinct: ['vendorId'], select: { vendorId: true } }),
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

  async onboard(name: string, contactEmail?: string) {
    return this.prisma.vendor.create({ data: { name, contactEmail } });
  }

  async getHealth(vendorId: string) {
    const [vendor, grouped, latest] = await Promise.all([
      this.prisma.vendor.findUnique({ where: { id: vendorId } }),
      this.prisma.payout.groupBy({ by: ['status'], where: { vendorId }, _count: { _all: true } }),
      this.prisma.payout.findFirst({
        where: { vendorId },
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
