CREATE TABLE "Vendor" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contactEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);
