import { BadRequestException, Injectable } from '@nestjs/common';
import { PayoutStatus, Prisma, Rail } from '@prisma/client';
import { AchRoutingConfig, DEFAULT_ACH_ROUTING_CONFIG } from './ach-routing.config';

export interface RoutingInput {
  vendorId: string;
  amount: string;
  rail: string;
  status?: string;
  currency?: string;
}

export interface RoutingDecision {
  rail: Rail;
  status: PayoutStatus;
  routeId: string | null;
  provider: string | null;
  fallback: boolean;
  reason: string;
}

@Injectable()
export class AchRoutingService {
  private readonly config: AchRoutingConfig = DEFAULT_ACH_ROUTING_CONFIG;

  decide(input: RoutingInput): RoutingDecision {
    if (!input || typeof input.vendorId !== 'string' || input.vendorId.trim() === '') {
      throw new BadRequestException('vendorId is required for routing');
    }
    const amount = this.parseAmount(input.amount);
    if ((input.currency ?? 'USD').toUpperCase() !== 'USD') {
      throw new BadRequestException('ACH routing supports USD only');
    }

    const rail = this.normalizeRail(input.rail);
    const status = this.normalizeStatus(input.status);

    if (rail === Rail.OTHER) {
      return this.result(rail, PayoutStatus.REQUIRES_REVIEW, null, null, false, 'Unrecognized rail');
    }
    if (status === PayoutStatus.REQUIRES_REVIEW) {
      return this.result(rail, status, null, null, false, 'Payout requires review');
    }
    if (status !== PayoutStatus.PENDING) {
      throw new BadRequestException(`Payout in status ${status} cannot be routed`);
    }
    if (rail !== Rail.ACH) {
      return this.result(rail, status, null, null, false, `Rail ${rail} is not routed through ACH`);
    }

    const route = [...this.config.routes]
      .filter((r) => r.enabled && amount.gte(r.minAmount) && amount.lte(r.maxAmount))
      .sort((a, b) => a.priority - b.priority)[0];
    if (route) {
      return this.result(Rail.ACH, status, route.id, route.provider, false, 'Matched ACH route');
    }
    return this.result(
      Rail[this.config.fallbackRail],
      PayoutStatus.REQUIRES_REVIEW,
      null,
      null,
      true,
      'No ACH route supports this amount; using fallback',
    );
  }

  private parseAmount(amount: string): Prisma.Decimal {
    if (typeof amount !== 'string') {
      throw new BadRequestException('Amount must be provided as a decimal string');
    }
    let value: Prisma.Decimal;
    try {
      value = new Prisma.Decimal(amount);
    } catch {
      throw new BadRequestException('Amount must be a valid decimal string');
    }
    if (!value.isFinite() || value.decimalPlaces() > 2) {
      throw new BadRequestException('Amount must be a finite value with at most two decimal places');
    }
    if (value.lte(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    return value;
  }

  private normalizeRail(rail: string): Rail {
    const normalized = typeof rail === 'string' ? rail.trim().toUpperCase() : '';
    return Object.values(Rail).find((r) => r === normalized) ?? Rail.OTHER;
  }

  private normalizeStatus(status?: string): PayoutStatus {
    if (status === undefined) {
      return PayoutStatus.PENDING;
    }
    const normalized = typeof status === 'string' ? status.trim().toUpperCase() : '';
    return Object.values(PayoutStatus).find((s) => s === normalized) ?? PayoutStatus.REQUIRES_REVIEW;
  }

  private result(
    rail: Rail,
    status: PayoutStatus,
    routeId: string | null,
    provider: string | null,
    fallback: boolean,
    reason: string,
  ): RoutingDecision {
    return { rail, status, routeId, provider, fallback, reason };
  }
}
