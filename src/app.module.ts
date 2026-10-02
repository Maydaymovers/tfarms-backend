import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { PayoutsModule } from './payouts/payouts.module';

@Module({
  imports: [PrismaModule, PayoutsModule],
})
export class AppModule {}
