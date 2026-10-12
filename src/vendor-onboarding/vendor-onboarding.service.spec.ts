import { PrismaService } from '../prisma/prisma.service';
import { VendorOnboardingService } from './vendor-onboarding.service';

describe('VendorOnboardingService', () => {
  it('creates a vendor and an onboarding row in one transaction', async () => {
    const tx = {
      vendor: {
        create: jest.fn().mockResolvedValue({ id: 'vendor-1', name: 'Acme', contactEmail: 'a@acme.test' }),
      },
      vendorOnboarding: {
        create: jest.fn().mockResolvedValue({ id: 'onboarding-1', vendorId: 'vendor-1', status: 'STARTED' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const service = new VendorOnboardingService(prisma as unknown as PrismaService);

    const result = await service.start({ name: 'Acme', contactEmail: 'a@acme.test' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.vendor.create).toHaveBeenCalledWith({
      data: { name: 'Acme', contactEmail: 'a@acme.test' },
    });
    expect(tx.vendorOnboarding.create).toHaveBeenCalledWith({ data: { vendorId: 'vendor-1' } });
    expect(result).toEqual({
      onboardingId: 'onboarding-1',
      vendorId: 'vendor-1',
      status: 'STARTED',
    });
  });
});
