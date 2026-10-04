import { BadRequestException } from '@nestjs/common';
import { PayoutStatus, Rail } from '@prisma/client';
import { AchRoutingService, RoutingInput } from './ach-routing.service';

describe('AchRoutingService.decide()', () => {
  let service: AchRoutingService;

  const base: RoutingInput = { vendorId: 'v1', amount: '125.40', rail: 'ach' };
  const decide = (overrides: Partial<RoutingInput> = {}) => service.decide({ ...base, ...overrides });

  beforeEach(() => {
    service = new AchRoutingService();
  });

  it('routes a normal ACH payout to the primary route', () => {
    expect(decide()).toEqual({
      rail: Rail.ACH,
      status: PayoutStatus.PENDING,
      routeId: 'ach-primary',
      provider: 'primary',
      fallback: false,
      reason: 'Matched ACH route',
    });
  });

  it('normalizes rail casing and whitespace', () => {
    expect(decide({ rail: '  Ach ' }).rail).toBe(Rail.ACH);
  });

  describe('unknown rail', () => {
    it('maps to OTHER with REQUIRES_REVIEW and no route', () => {
      expect(decide({ rail: 'bitcoin' })).toEqual({
        rail: Rail.OTHER,
        status: PayoutStatus.REQUIRES_REVIEW,
        routeId: null,
        provider: null,
        fallback: false,
        reason: 'Unrecognized rail',
      });
    });

    it('treats a non-string rail as unrecognized', () => {
      expect(decide({ rail: undefined as unknown as string }).rail).toBe(Rail.OTHER);
    });
  });

  it('does not route non-ACH rails', () => {
    const result = decide({ rail: 'paypal' });
    expect(result.rail).toBe(Rail.PAYPAL);
    expect(result.status).toBe(PayoutStatus.PENDING);
    expect(result.routeId).toBeNull();
    expect(result.fallback).toBe(false);
  });

  describe('status handling', () => {
    it('maps an unknown status to REQUIRES_REVIEW', () => {
      const result = decide({ status: 'bogus' });
      expect(result.status).toBe(PayoutStatus.REQUIRES_REVIEW);
      expect(result.rail).toBe(Rail.ACH);
      expect(result.routeId).toBeNull();
    });

    it('keeps an explicit REQUIRES_REVIEW status', () => {
      expect(decide({ status: 'requires_review' }).status).toBe(PayoutStatus.REQUIRES_REVIEW);
    });

    it.each(['processing', 'completed', 'failed', 'reversed'])('rejects non-routable status %s', (status) => {
      expect(() => decide({ status })).toThrow(BadRequestException);
    });
  });

  describe('threshold boundaries', () => {
    it.each([
      ['0.01', 'ach-primary'],
      ['25000.00', 'ach-primary'],
      ['25000.01', 'ach-secondary'],
      ['100000.00', 'ach-secondary'],
    ])('amount %s -> %s', (amount, routeId) => {
      const result = decide({ amount });
      expect(result.routeId).toBe(routeId);
      expect(result.fallback).toBe(false);
      expect(result.status).toBe(PayoutStatus.PENDING);
    });
  });

  it('falls back to MANUAL with REQUIRES_REVIEW above all route maximums', () => {
    expect(decide({ amount: '100000.01' })).toEqual({
      rail: Rail.MANUAL,
      status: PayoutStatus.REQUIRES_REVIEW,
      routeId: null,
      provider: null,
      fallback: true,
      reason: 'No ACH route supports this amount; using fallback',
    });
  });

  describe('currency', () => {
    it('accepts USD case-insensitively and by default', () => {
      expect(decide({ currency: 'usd' }).routeId).toBe('ach-primary');
      expect(decide({ currency: undefined }).routeId).toBe('ach-primary');
    });

    it.each(['EUR', 'GBP', ''])('rejects non-USD currency "%s"', (currency) => {
      expect(() => decide({ currency })).toThrow(BadRequestException);
    });
  });

  describe('input validation', () => {
    it.each(['', '   '])('rejects blank vendorId "%s"', (vendorId) => {
      expect(() => decide({ vendorId })).toThrow(BadRequestException);
    });

    it.each([
      ['zero', '0'],
      ['negative', '-5.00'],
      ['too many decimals', '10.001'],
      ['not a number', 'abc'],
      ['infinite', 'Infinity'],
    ])('rejects amount that is %s', (_label, amount) => {
      expect(() => decide({ amount })).toThrow(BadRequestException);
    });

    it('rejects a numeric (non-string) amount', () => {
      expect(() => decide({ amount: 125.4 as unknown as string })).toThrow(BadRequestException);
    });
  });
});
