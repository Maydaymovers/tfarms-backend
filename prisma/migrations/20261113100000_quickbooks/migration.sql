ALTER TABLE "Vendor" ADD COLUMN "qboVendorId" TEXT;
ALTER TABLE "Payout" ADD COLUMN "qboBillPaymentId" TEXT;

CREATE TABLE "QuickbooksAuth" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "realmId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickbooksAuth_pkey" PRIMARY KEY ("id")
);
