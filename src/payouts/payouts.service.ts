import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Payout, PayoutStatus, Prisma, Rail } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

  async findAll(): Promise<Payout[]> {
    return this.prisma.payout.findMany();
  }

  async getPendingPayouts(): Promise<Payout[]> {
    return this.prisma.payout.findMany({ where: { status: PayoutStatus.PENDING } });
  }

  async findById(id: string): Promise<Payout> {
    const payout = await this.prisma.payout.findUnique({ where: { id } });
    if (!payout) {
      throw new NotFoundException(`Payout ${id} not found`);
    }
    return payout;
  }

  async findByVendor(vendorId: string): Promise<Payout[]> {
    return this.prisma.payout.findMany({ where: { vendorId } });
  }

  async create(vendorId: string, amount: string, rail: string): Promise<Payout> {
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

    return this.prisma.payout.create({
      data: {
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
  ): Promise<Payout> {
    await this.findById(id);
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
