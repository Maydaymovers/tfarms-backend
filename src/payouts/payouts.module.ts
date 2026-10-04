import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PayoutsController } from './payouts.controller';
import { AchRoutingService } from './routing/ach-routing.service';
import { PayoutsService } from './payouts.service';

@Module({
  imports: [PrismaModule],
  controllers: [PayoutsController],
  providers: [PayoutsService, AchRoutingService],
})
export class PayoutsModule {}
