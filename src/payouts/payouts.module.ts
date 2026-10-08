import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PayoutsController } from './payouts.controller';
import { AchRoutingService } from './routing/ach-routing.service';
import { PayoutsService } from './payouts.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PayoutsController],
  providers: [PayoutsService, AchRoutingService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
