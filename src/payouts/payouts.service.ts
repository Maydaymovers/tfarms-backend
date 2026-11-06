import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Payout, PayoutStatus, Prisma, Rail } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HotelScope } from '../auth/hotel-context';

export type { Payout };

function parseEnumValue<T extends string>(
  value: string,
  values: Record<string, T>,
  label: string,
): T {
  if (typeof value !== 'string') {
    throw new BadRequestException(`Invalid ${label}: ${value}`);
  }
  const normalized = value.trim().toUpperCase();
  const result = Object.values(values).find((candidate) => candidate === normalized);
  if (!result) {
    throw new BadRequestException(`Invalid ${label}: ${value}`);
  }
  return result;
}

@Injectable()
export class PayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(scope: HotelScope = {}): Promise<Payout[]> {
    return this.prisma.payout.findMany({ where: { ...scope } });
  }

  async getPendingPayouts(scope: HotelScope = {}): Promise<Payout[]> {
    return this.prisma.payout.findMany({ where: { status: PayoutStatus.PENDING, ...scope } });
  }

  async findById(id: string, scope: HotelScope = {}): Promise<Payout> {
    // A payout in another hotel is reported as not found, so ids do not leak.
    const payout = await this.prisma.payout.findFirst({ where: { id, ...scope } });
    if (!payout) {
      throw new NotFoundException(`Payout ${id} not found`);
    }
    return payout;
  }

  async findByVendor(vendorId: string, scope: HotelScope = {}): Promise<Payout[]> {
    return this.prisma.payout.findMany({ where: { vendorId, ...scope } });
  }

  /**
   * scope.hotelId set: member request, the vendor must belong to that hotel and
   * the payout is stamped with it. Empty scope: service request; hotelId (if
   * given) is stored as-is.
   */
  async create(
    vendorId: string,
    amount: string,
    rail: string,
    scope: HotelScope = {},
  ): Promise<Payout> {
    if (typeof amount !== 'string') {
      throw new BadRequestException('Amount must be provided as a decimal string');
    }
    let decimalAmount: Prisma.Decimal;
    try {
      decimalAmount = new Prisma.Decimal(amount);
    } catch {
      throw new BadRequestException('Amount must be a valid decimal string');
    }
    if (!decimalAmount.isFinite() || decimalAmount.decimalPlaces() > 2) {
      throw new BadRequestException('Amount must be a finite value with at most two decimal places');
    }

    if (scope.hotelId) {
      const vendor = await this.prisma.vendor.findFirst({ where: { id: vendorId, hotelId: scope.hotelId } });
      if (!vendor) {
        throw new NotFoundException(`Vendor ${vendorId} not found`);
      }
    }

    return this.prisma.payout.create({
      data: {
        hotelId: scope.hotelId,
        vendorId,
        amount: decimalAmount,
        rail: parseEnumValue(rail, Rail, 'rail'),
        status: PayoutStatus.PENDING,
      },
    });
  }

  async updateStatus(
    id: string,
    status: string,
    externalTransactionId?: string,
    failureReason?: string,
    scope: HotelScope = {},
  ): Promise<Payout> {
    await this.findById(id, scope);
    return this.prisma.payout.update({
      where: { id },
      data: {
        status: parseEnumValue(status, PayoutStatus, 'payout status'),
        externalTransactionId,
        failureReason,
      },
    });
  }
}
