import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const vendorId = 'seed-vendor-001';

  const existing = await prisma.payout.findFirst({ where: { vendorId } });
  if (existing) {
    console.log('Seed data already present, skipping.');
    return;
  }

  await prisma.payout.create({
    data: {
      vendorId,
      amount: '100.00',
      rail: 'ACH',
      status: 'PENDING',
    },
  });

  console.log('Seed data created.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
