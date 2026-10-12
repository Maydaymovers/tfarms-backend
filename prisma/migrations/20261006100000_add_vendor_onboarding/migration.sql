-- CreateEnum
CREATE TYPE "VendorOnboardingStatus" AS ENUM ('STARTED');

-- CreateTable
CREATE TABLE "VendorOnboarding" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "status" "VendorOnboardingStatus" NOT NULL DEFAULT 'STARTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VendorOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorOnboarding_vendorId_key" ON "VendorOnboarding"("vendorId");

-- AddForeignKey
ALTER TABLE "VendorOnboarding" ADD CONSTRAINT "VendorOnboarding_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
