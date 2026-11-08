import { VendorStatus } from '@prisma/client';

const S = VendorStatus;

/** Allowed status changes. Anything not listed is rejected. */
export const ALLOWED_TRANSITIONS: Record<VendorStatus, readonly VendorStatus[]> = {
  [S.PENDING]: [S.SETUP_REQUIRED],
  [S.SETUP_REQUIRED]: [S.BANK_CONNECTED],
  [S.BANK_CONNECTED]: [S.VERIFICATION_PENDING, S.SETUP_REQUIRED],
  [S.VERIFICATION_PENDING]: [S.ACTIVE, S.SETUP_REQUIRED],
  [S.ACTIVE]: [S.SUSPENDED],
  [S.SUSPENDED]: [S.ACTIVE, S.SETUP_REQUIRED],
};

export function canTransition(from: VendorStatus, to: VendorStatus): boolean {
  // Unknown values fail closed.
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}
