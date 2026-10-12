import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StartOnboardingDto } from './dto/start-onboarding.dto';

@Injectable()
export class VendorOnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async start(dto: StartOnboardingDto) {
    const { vendor, onboarding } = await this.prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.create({
        data: { name: dto.name, contactEmail: dto.contactEmail },
      });
      const onboarding = await tx.vendorOnboarding.create({
        data: { vendorId: vendor.id },
      });
      return { vendor, onboarding };
    });

    return {
      onboardingId: onboarding.id,
      vendorId: vendor.id,
      status: onboarding.status,
    };
  }
}
