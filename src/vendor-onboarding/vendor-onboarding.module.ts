import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { VendorOnboardingController } from './vendor-onboarding.controller';
import { VendorOnboardingService } from './vendor-onboarding.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [VendorOnboardingController],
  providers: [VendorOnboardingService],
})
export class VendorOnboardingModule {}
