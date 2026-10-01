import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface Payout {
  id: string;
  vendorId: string;
  amount: number;
  rail: string;
  status: string;
  externalTransactionId?: string;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PayoutsService {
  private readonly payouts = new Map<string, Payout>();

  async findAll(): Promise<Payout[]> {
    return Array.from(this.payouts.values());
  }

  async getPendingPayouts(): Promise<Payout[]> {
    return (await this.findAll()).filter((p) => p.status === 'pending');
  }

  async findById(id: string): Promise<Payout> {
    const payout = this.payouts.get(id);
    if (!payout) {
      throw new NotFoundException(`Payout ${id} not found`);
    }
    return payout;
  }

  async findByVendor(vendorId: string): Promise<Payout[]> {
    return (await this.findAll()).filter((p) => p.vendorId === vendorId);
  }

  async create(vendorId: string, amount: number, rail: string): Promise<Payout> {
    const now = new Date();
    const payout: Payout = {
      id: randomUUID(),
      vendorId,
      amount,
      rail,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.payouts.set(payout.id, payout);
    return payout;
  }

  async updateStatus(
    id: string,
    status: string,
    externalTransactionId?: string,
    failureReason?: string,
  ): Promise<Payout> {
    const payout = await this.findById(id);
    payout.status = status;
    payout.externalTransactionId = externalTransactionId;
    payout.failureReason = failureReason;
    payout.updatedAt = new Date();
    return payout;
  }
}
