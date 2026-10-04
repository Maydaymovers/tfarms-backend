CREATE TYPE "Rail" AS ENUM ('ach', 'paypal', 'rtp', 'wallet', 'manual', 'other');
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'reversed', 'requires_review');
CREATE TYPE "LedgerEntryType" AS ENUM ('payout_debit', 'payout_fee', 'payout_reversal', 'adjustment_credit', 'adjustment_debit');

ALTER TABLE "Payout" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Payout"
  ALTER COLUMN "amount" TYPE DECIMAL(18, 2) USING ROUND("amount"::numeric, 2),
  ALTER COLUMN "rail" TYPE "Rail" USING (
    CASE LOWER(TRIM("rail"))
      WHEN 'ach' THEN 'ach'
      WHEN 'paypal' THEN 'paypal'
      WHEN 'rtp' THEN 'rtp'
      WHEN 'wallet' THEN 'wallet'
      WHEN 'manual' THEN 'manual'
      ELSE 'other'
    END
  )::"Rail",
  ALTER COLUMN "status" TYPE "PayoutStatus" USING (
    CASE LOWER(TRIM("status"))
      WHEN 'pending' THEN 'pending'
      WHEN 'processing' THEN 'processing'
      WHEN 'completed' THEN 'completed'
      WHEN 'failed' THEN 'failed'
      WHEN 'reversed' THEN 'reversed'
      ELSE 'requires_review'
    END
  )::"PayoutStatus",
  ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE "Payout" ALTER COLUMN "status" SET DEFAULT 'pending';

CREATE TABLE "LedgerEntry" (
  "id" TEXT NOT NULL,
  "type" "LedgerEntryType" NOT NULL,
  "amount" DECIMAL(18, 2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "vendorId" TEXT,
  "payoutId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LedgerEntry_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "LedgerEntry_vendorId_idx" ON "LedgerEntry"("vendorId");
CREATE INDEX "LedgerEntry_type_idx" ON "LedgerEntry"("type");
CREATE INDEX "LedgerEntry_payoutId_idx" ON "LedgerEntry"("payoutId");
