import { Injectable, NotFoundException } from '@nestjs/common';
import { Payout } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type { Payout };

@Injectable()
export class PayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Payout[]> {
    return this.prisma.payout.findMany();
  }

  async getPendingPayouts(): Promise<Payout[]> {
    return this.prisma.payout.findMany({ where: { status: 'pending' } });
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

  async create(vendorId: string, amount: number, rail: string): Promise<Payout> {
    return this.prisma.payout.create({
      data: {
        vendorId,
        amount,
        rail,
        status: 'pending',
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
        status,
        externalTransactionId,
        failureReason,
      },
    });
  }
}
