import { VendorStatus } from '@prisma/client';
import { ALLOWED_TRANSITIONS, canTransition } from './vendor-status';

describe('vendor status transitions', () => {
  const allowed: [VendorStatus, VendorStatus][] = [
    ['PENDING', 'SETUP_REQUIRED'],
    ['SETUP_REQUIRED', 'BANK_CONNECTED'],
    ['BANK_CONNECTED', 'VERIFICATION_PENDING'],
    ['VERIFICATION_PENDING', 'ACTIVE'],
    ['ACTIVE', 'SUSPENDED'],
    ['BANK_CONNECTED', 'SETUP_REQUIRED'],
    ['VERIFICATION_PENDING', 'SETUP_REQUIRED'],
    ['SUSPENDED', 'ACTIVE'],
    ['SUSPENDED', 'SETUP_REQUIRED'],
  ];

  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it('allows nothing else (including no-ops and skipping to ACTIVE)', () => {
    const all = Object.keys(ALLOWED_TRANSITIONS) as VendorStatus[];
    const count = all.flatMap((from) => all.filter((to) => canTransition(from, to))).length;
    expect(count).toBe(allowed.length);
    expect(canTransition('PENDING', 'ACTIVE')).toBe(false);
    expect(canTransition('SETUP_REQUIRED', 'ACTIVE')).toBe(false);
    expect(canTransition('ACTIVE', 'ACTIVE')).toBe(false);
  });

  it('fails closed on unknown values', () => {
    expect(canTransition('NOPE' as VendorStatus, 'ACTIVE')).toBe(false);
  });
});
