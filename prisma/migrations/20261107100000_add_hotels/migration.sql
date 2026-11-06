-- CreateEnum
CREATE TYPE "HotelRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateTable
CREATE TABLE "Hotel" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelMember" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "wixMemberId" TEXT NOT NULL,
  "role" "HotelRole" NOT NULL DEFAULT 'STAFF',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HotelMember_pkey" PRIMARY KEY ("id")
);

-- AlterTable (nullable: rows with no hotel are invisible to hotel members)
ALTER TABLE "Vendor" ADD COLUMN "hotelId" TEXT;
ALTER TABLE "Payout" ADD COLUMN "hotelId" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "hotelId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "HotelMember_wixMemberId_key" ON "HotelMember"("wixMemberId");
CREATE INDEX "HotelMember_hotelId_idx" ON "HotelMember"("hotelId");
CREATE INDEX "Vendor_hotelId_idx" ON "Vendor"("hotelId");
CREATE INDEX "Payout_hotelId_idx" ON "Payout"("hotelId");
CREATE INDEX "LedgerEntry_hotelId_idx" ON "LedgerEntry"("hotelId");

-- AddForeignKey
ALTER TABLE "HotelMember" ADD CONSTRAINT "HotelMember_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
