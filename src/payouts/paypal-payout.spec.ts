import { PayoutStatus, Rail, VendorStatus } from '@prisma/client';
import { PayoutsService } from './payouts.service';
import { PaypalRejectedError } from '../paypal/paypal.service';

function setup(payoutOver: Record<string, unknown> = {}, vendorOver: Record<string, unknown> = {}) {
  const payout: any = {
    id: 'p1', hotelId: 'h1', vendorId: 'v1', amount: { toFixed: () => '12.50' }, currency: 'USD',
    rail: Rail.PAYPAL, status: PayoutStatus.PENDING, ...payoutOver,
  };
  const vendor = { id: 'v1', status: VendorStatus.ACTIVE, paypalEmail: 'v@example.com', ...vendorOver };
  const ledger: any[] = [];
  const prisma: any = {
    payout: {
      findFirst: jest.fn(async () => payout),
      findUnique: jest.fn(async () => payout),
      findUniqueOrThrow: jest.fn(async () => payout),
      update: jest.fn(async ({ data }: any) => Object.assign(payout, data)),
      updateMany: jest.fn(async ({ data }: any) => { Object.assign(payout, data); return { count: 1 }; }),
    },
    payoutStatusEvent: { create: jest.fn() },
    vendor: { findUnique: jest.fn(async () => vendor) },
    ledgerEntry: {
      findFirst: jest.fn(async ({ where }: any) => ledger.find((l) => l.type === where.type && l.payoutId === where.payoutId) ?? null),
      create: jest.fn(async ({ data }: any) => { ledger.push(data); }),
    },
  };
  prisma.$transaction = async (fn: any) => fn(prisma);
  const paypal: any = { isConfigured: () => true, sendPayout: jest.fn(async () => 'BATCH1') };
  return { svc: new PayoutsService(prisma, paypal), payout, paypal, ledger };
}

describe('PayPal payouts', () => {
  it('sends a pending payout and records the batch id', async () => {
    const { svc, payout, paypal } = setup();
    await svc.sendViaPaypal('p1', 'platform_admin');
    expect(paypal.sendPayout).toHaveBeenCalledWith({ payoutId: 'p1', amount: '12.50', currency: 'USD', receiverEmail: 'v@example.com' });
    expect(payout.status).toBe(PayoutStatus.PROCESSING);
    expect(payout.externalTransactionId).toBe('BATCH1');
  });

  it('refuses non-PayPal rails, inactive vendors and missing email', async () => {
    await expect(setup({ rail: Rail.ACH }).svc.sendViaPaypal('p1', 'x')).rejects.toThrow();
    await expect(setup({}, { status: VendorStatus.SUSPENDED }).svc.sendViaPaypal('p1', 'x')).rejects.toThrow();
    const noEmail = setup({}, { paypalEmail: null });
    await expect(noEmail.svc.sendViaPaypal('p1', 'x')).rejects.toThrow();
    expect(noEmail.paypal.sendPayout).not.toHaveBeenCalled();
  });

  it('marks the payout FAILED when PayPal rejects it', async () => {
    const { svc, payout, paypal } = setup();
    paypal.sendPayout.mockRejectedValue(new PaypalRejectedError('INSUFFICIENT_FUNDS'));
    await expect(svc.sendViaPaypal('p1', 'x')).rejects.toThrow('rejected');
    expect(payout.status).toBe(PayoutStatus.FAILED);
  });

  it('leaves the payout PROCESSING when the outcome is unknown', async () => {
    const { svc, payout, paypal } = setup();
    paypal.sendPayout.mockRejectedValue(new Error('timeout'));
    await expect(svc.sendViaPaypal('p1', 'x')).rejects.toThrow('unknown');
    expect(payout.status).toBe(PayoutStatus.PROCESSING);
  });

  it('webhook completion posts one ledger debit, even when repeated', async () => {
    const { svc, payout, ledger } = setup({ status: PayoutStatus.PROCESSING });
    await svc.applyProviderOutcome('p1', 'COMPLETED', 'ok');
    await svc.applyProviderOutcome('p1', 'COMPLETED', 'ok');
    expect(payout.status).toBe(PayoutStatus.COMPLETED);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe('PAYOUT_DEBIT');
  });

  it('webhook return reverses a completed payout; late failure is ignored', async () => {
    const done = setup({ status: PayoutStatus.COMPLETED });
    await done.svc.applyProviderOutcome('p1', 'FAILED', 'late');
    expect(done.payout.status).toBe(PayoutStatus.COMPLETED);
    await done.svc.applyProviderOutcome('p1', 'REVERSED', 'returned');
    expect(done.payout.status).toBe(PayoutStatus.REVERSED);
    expect(done.ledger[0].type).toBe('PAYOUT_REVERSAL');
  });
});
