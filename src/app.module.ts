import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { PayoutsModule } from './payouts/payouts.module';
import { AuthModule } from './auth/auth.module';
import { LedgerModule } from './ledger/ledger.module';
import { HealthModule } from './health/health.module';

export function getCorsOptions() {
  return {
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  };
}

@Module({
  imports: [PrismaModule, AuthModule, PayoutsModule, LedgerModule, HealthModule],
})
export class AppModule {}
