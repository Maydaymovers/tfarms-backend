import { PayoutStatus } from '@prisma/client';
import { ALLOWED_TRANSITIONS, canTransition } from './payout-status';

describe('payout status transitions', () => {
  const allowed: [PayoutStatus, PayoutStatus][] = [
    ['PENDING', 'PROCESSING'],
    ['PENDING', 'REQUIRES_REVIEW'],
    ['PENDING', 'FAILED'],
    ['REQUIRES_REVIEW', 'PENDING'],
    ['REQUIRES_REVIEW', 'FAILED'],
    ['PROCESSING', 'COMPLETED'],
    ['PROCESSING', 'FAILED'],
    ['PROCESSING', 'REQUIRES_REVIEW'],
    ['COMPLETED', 'REVERSED'],
  ];

  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it('allows nothing else', () => {
    const all = Object.keys(ALLOWED_TRANSITIONS) as PayoutStatus[];
    const count = all.flatMap((from) => all.filter((to) => canTransition(from, to))).length;
    expect(count).toBe(allowed.length);
  });

  it('never leaves COMPLETED except to REVERSED, and FAILED/REVERSED are final', () => {
    expect(canTransition('COMPLETED', 'PENDING')).toBe(false);
    expect(canTransition('COMPLETED', 'FAILED')).toBe(false);
    expect(canTransition('PENDING', 'COMPLETED')).toBe(false);
    expect(ALLOWED_TRANSITIONS.FAILED).toEqual([]);
    expect(ALLOWED_TRANSITIONS.REVERSED).toEqual([]);
  });

  it('fails closed on unknown values', () => {
    expect(canTransition('NOPE' as PayoutStatus, 'PENDING')).toBe(false);
  });
});
