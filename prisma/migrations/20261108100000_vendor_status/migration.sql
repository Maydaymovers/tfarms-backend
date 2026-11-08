-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('PENDING', 'SETUP_REQUIRED', 'BANK_CONNECTED', 'VERIFICATION_PENDING', 'ACTIVE', 'SUSPENDED');

-- AlterTable: every existing vendor (all previously STARTED) becomes PENDING via the default
ALTER TABLE "Vendor" ADD COLUMN "status" "VendorStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "VendorStatusEvent" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "hotelId" TEXT,
  "oldStatus" "VendorStatus" NOT NULL,
  "newStatus" "VendorStatus" NOT NULL,
  "changedBy" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VendorStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vendor_status_idx" ON "Vendor"("status");
CREATE INDEX "VendorStatusEvent_vendorId_createdAt_idx" ON "VendorStatusEvent"("vendorId", "createdAt");
CREATE UNIQUE INDEX "IdempotencyKey_scope_key_key" ON "IdempotencyKey"("scope", "key");

-- AddForeignKey
ALTER TABLE "VendorStatusEvent" ADD CONSTRAINT "VendorStatusEvent_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
