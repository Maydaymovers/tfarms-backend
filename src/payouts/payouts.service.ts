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
  // Placeholder in-memory store until a real database is connected.
  private payouts: Payout[] = [];

  async findAll(): Promise<Payout[]> {
    return this.payouts;
  }

  async getPendingPayouts(): Promise<Payout[]> {
    return this.payouts.filter((p) => p.status === 'pending');
  }

  async findById(id: string): Promise<Payout> {
    const payout = this.payouts.find((p) => p.id === id);
    if (!payout) {
      throw new NotFoundException(`Payout ${id} not found`);
    }
    return payout;
  }

  async findByVendor(vendorId: string): Promise<Payout[]> {
    return this.payouts.filter((p) => p.vendorId === vendorId);
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
    this.payouts.push(payout);
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
    if (externalTransactionId !== undefined) {
      payout.externalTransactionId = externalTransactionId;
    }
    if (failureReason !== undefined) {
      payout.failureReason = failureReason;
    }
    payout.updatedAt = new Date();
    return payout;
  }
}
