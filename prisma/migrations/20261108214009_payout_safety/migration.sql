-- CreateTable
CREATE TABLE "PayoutStatusEvent" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "hotelId" TEXT,
    "oldStatus" "PayoutStatus" NOT NULL,
    "newStatus" "PayoutStatus" NOT NULL,
    "changedBy" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayoutStatusEvent_payoutId_createdAt_idx" ON "PayoutStatusEvent"("payoutId", "createdAt");

-- AddForeignKey
ALTER TABLE "PayoutStatusEvent" ADD CONSTRAINT "PayoutStatusEvent_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
