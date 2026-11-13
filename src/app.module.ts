import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { PayoutsModule } from './payouts/payouts.module';
import { AuthModule } from './auth/auth.module';
import { SignupModule } from './signup/signup.module';
import { HotelsModule } from './hotels/hotels.module';
import { LedgerModule } from './ledger/ledger.module';
import { HealthModule } from './health/health.module';
import { VendorsModule } from './vendors/vendors.module';
import { VendorOnboardingModule } from './vendor-onboarding/vendor-onboarding.module';
import { PaypalModule } from './paypal/paypal.module';
import { QuickbooksModule } from './quickbooks/quickbooks.module';

export function getCorsOptions() {
  return {
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  };
}

@Module({
  imports: [PrismaModule, AuthModule, PayoutsModule, LedgerModule, HealthModule, VendorsModule, VendorOnboardingModule, HotelsModule, SignupModule, PaypalModule, QuickbooksModule],
})
export class AppModule {}
