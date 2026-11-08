import { PayoutStatus } from '@prisma/client';

const S = PayoutStatus;

/**
 * Allowed payout status changes. Anything not listed is rejected.
 * COMPLETED can only become REVERSED (a return after completion); FAILED and
 * REVERSED are final. A failed payout is retried as a new payout.
 */
export const ALLOWED_TRANSITIONS: Record<PayoutStatus, readonly PayoutStatus[]> = {
  [S.PENDING]: [S.PROCESSING, S.REQUIRES_REVIEW, S.FAILED],
  [S.REQUIRES_REVIEW]: [S.PENDING, S.FAILED],
  [S.PROCESSING]: [S.COMPLETED, S.FAILED, S.REQUIRES_REVIEW],
  [S.COMPLETED]: [S.REVERSED],
  [S.FAILED]: [],
  [S.REVERSED]: [],
};

export function canTransition(from: PayoutStatus, to: PayoutStatus): boolean {
  // Unknown values fail closed.
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}
