import { createHash } from 'crypto';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LedgerEntryType, Payout, PayoutStatus, Prisma, Rail, VendorStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HotelScope } from '../auth/hotel-context';
import { canTransition } from './payout-status';
import { PaypalRejectedError, PaypalService } from '../paypal/paypal.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly paypal: PaypalService,
  ) {}

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
   * the payout is stamped with it. Empty scope: service request (requestedHotelId
   * is the optional hotelId from the body).
   *
   * Ownership: if the vendor is onboarded into a hotel, the payout always lands in
   * that hotel, and a different hotelId in the request is rejected. Vendors that
   * only exist on legacy payouts (not onboarded) keep the old behavior.
   *
   * Idempotency-Key is required. A retry with the same key and body returns the
   * first payout instead of creating a second; the same key with a different
   * body is rejected.
   */
  async create(
    vendorId: string,
    amount: string,
    rail: string,
    scope: HotelScope = {},
    idempotencyKey?: string,
    requestedHotelId?: string,
  ): Promise<Payout> {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    if (idempotencyKey.length > 200) {
      throw new BadRequestException('Idempotency-Key must be at most 200 characters');
    }
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
    if (decimalAmount.lte(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    const railValue = parseEnumValue(rail, Rail, 'rail');

    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    let hotelId = scope.hotelId;
    if (hotelId) {
      if (!vendor || vendor.hotelId !== hotelId) {
        throw new NotFoundException(`Vendor ${vendorId} not found`);
      }
    } else if (vendor?.hotelId) {
      // Service request: the vendor's hotel wins; a different hotelId is an error.
      if (requestedHotelId && requestedHotelId !== vendor.hotelId) {
        throw new BadRequestException("hotelId does not match the vendor's hotel");
      }
      hotelId = vendor.hotelId;
    } else {
      hotelId = requestedHotelId; // vendor not in any hotel: stored as given, as before
    }

    const keyScope = `payout:${hotelId ?? 'service'}`;
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({ vendorId, amount: decimalAmount.toFixed(2), rail: railValue, hotelId: hotelId ?? null }),
      )
      .digest('hex');
    const replay = async (): Promise<Payout | null> => {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { scope_key: { scope: keyScope, key: idempotencyKey } },
      });
      if (!existing) return null;
      if (existing.requestHash !== requestHash) {
        throw new UnprocessableEntityException('Idempotency-Key was already used with a different request');
      }
      return existing.response as unknown as Payout;
    };

    const prior = await replay();
    if (prior) return prior;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const payout = await tx.payout.create({
          data: {
            hotelId,
            vendorId,
            amount: decimalAmount,
            rail: railValue,
            status: PayoutStatus.PENDING,
          },
        });
        await tx.idempotencyKey.create({
          data: {
            scope: keyScope,
            key: idempotencyKey,
            requestHash,
            response: JSON.parse(JSON.stringify(payout)),
          },
        });
        return payout;
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

  /**
   * Sends a PENDING PayPal-rail payout to the vendor's paypalEmail. The payout is
   * moved to PROCESSING first (compare-and-set), so a double click cannot send
   * twice. If PayPal rejects the request nothing was sent and the payout becomes
   * FAILED. If the outcome is unknown (timeout, 5xx) it stays PROCESSING for
   * review: retrying is safe because PayPal dedupes on the payout id.
   * Completion arrives later through the PayPal webhook.
   */
  async sendViaPaypal(id: string, changedBy: string, scope: HotelScope = {}): Promise<Payout> {
    const payout = await this.findById(id, scope);
    if (payout.rail !== Rail.PAYPAL) {
      throw new BadRequestException('Only payouts on the PAYPAL rail can be sent through PayPal');
    }
    if (payout.currency !== 'USD') {
      throw new BadRequestException('Only USD payouts are supported');
    }
    const vendor = await this.prisma.vendor.findUnique({ where: { id: payout.vendorId } });
    if (!vendor || vendor.status !== VendorStatus.ACTIVE) {
      throw new UnprocessableEntityException('Vendor must be ACTIVE to receive a payout');
    }
    if (!vendor.paypalEmail) {
      throw new UnprocessableEntityException('Vendor has no PayPal email on file');
    }
    if (!this.paypal.isConfigured()) {
      throw new ServiceUnavailableException('PayPal is not configured');
    }
    if (payout.status === PayoutStatus.PROCESSING) {
      // Retry of an unknown outcome: PayPal dedupes on the payout id.
    } else {
      await this.updateStatus(id, PayoutStatus.PROCESSING, changedBy, { reason: 'Sent via PayPal' }, scope);
    }
    try {
      const batchId = await this.paypal.sendPayout({
        payoutId: id,
        amount: payout.amount.toFixed(2),
        currency: payout.currency,
        receiverEmail: vendor.paypalEmail,
      });
      await this.prisma.payout.update({ where: { id }, data: { externalTransactionId: batchId } });
    } catch (err) {
      if (err instanceof PaypalRejectedError) {
        await this.updateStatus(
          id,
          PayoutStatus.FAILED,
          changedBy,
          { failureReason: err.message, reason: 'PayPal rejected the payout' },
          scope,
        );
        throw new UnprocessableEntityException(`PayPal rejected the payout: ${err.message}`);
      }
      throw new BadGatewayException('PayPal outcome unknown; payout left PROCESSING, safe to retry');
    }
    return this.findById(id, scope);
  }

  /**
   * Applies a settlement outcome reported by the provider webhook. Idempotent:
   * a repeated event, or one that arrives after the payout already moved on,
   * changes nothing. Posts the ledger entry for COMPLETED and REVERSED.
   */
  async applyProviderOutcome(
    id: string,
    outcome: 'COMPLETED' | 'FAILED' | 'REVERSED',
    reason: string,
  ): Promise<void> {
    const payout = await this.prisma.payout.findUnique({ where: { id } });
    if (!payout || payout.rail !== Rail.PAYPAL) return;
    const target = PayoutStatus[outcome];
    if (payout.status !== target) {
      if (!canTransition(payout.status, target)) return;
      await this.updateStatus(id, target, 'provider:paypal', {
        reason,
        failureReason: outcome === 'FAILED' ? reason : undefined,
      });
    }
    const type =
      outcome === 'COMPLETED'
        ? LedgerEntryType.PAYOUT_DEBIT
        : outcome === 'REVERSED'
          ? LedgerEntryType.PAYOUT_REVERSAL
          : null;
    if (type) {
      const exists = await this.prisma.ledgerEntry.findFirst({ where: { payoutId: id, type } });
      if (!exists) {
        await this.prisma.ledgerEntry.create({
          data: {
            hotelId: payout.hotelId,
            type,
            amount: payout.amount,
            currency: payout.currency,
            vendorId: payout.vendorId,
            payoutId: id,
          },
        });
      }
    }
  }

  async statusHistory(id: string, scope: HotelScope = {}) {
    await this.findById(id, scope);
    return this.prisma.payoutStatusEvent.findMany({
      where: { payoutId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Validates the transition, updates the payout and writes the history row together. */
  async updateStatus(
    id: string,
    status: string,
    changedBy: string,
    details: { externalTransactionId?: string; failureReason?: string; reason?: string } = {},
    scope: HotelScope = {},
  ): Promise<Payout> {
    const newStatus = parseEnumValue(status, PayoutStatus, 'payout status');
    const payout = await this.findById(id, scope);
    if (!canTransition(payout.status, newStatus)) {
      throw new ConflictException({
        statusCode: 409,
        code: 'INVALID_PAYOUT_TRANSITION',
        message: `Cannot change payout status from ${payout.status} to ${newStatus}`,
      });
    }
    const reason = details.reason?.trim() || details.failureReason?.trim() || undefined;
    if (newStatus === PayoutStatus.REVERSED && !reason) {
      throw new BadRequestException('A reason is required to reverse a payout');
    }
    return this.prisma.$transaction(async (tx) => {
      // Compare-and-set so two concurrent changes cannot both apply.
      const changed = await tx.payout.updateMany({
        where: { id, status: payout.status },
        data: {
          status: newStatus,
          externalTransactionId: details.externalTransactionId,
          failureReason: details.failureReason,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException({
          statusCode: 409,
          code: 'INVALID_PAYOUT_TRANSITION',
          message: 'Payout status changed concurrently; reload and try again',
        });
      }
      await tx.payoutStatusEvent.create({
        data: {
          payoutId: id,
          hotelId: payout.hotelId,
          oldStatus: payout.status,
          newStatus,
          changedBy,
          reason,
        },
      });
      return tx.payout.findUniqueOrThrow({ where: { id } });
    });
  }
}
