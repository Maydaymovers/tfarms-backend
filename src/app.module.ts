import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { PayoutsController } from './payouts/payouts.controller';
import { PayoutsService } from './payouts/payouts.service';

@Module({
  imports: [],
  controllers: [PayoutsController],
  providers: [AppService, PayoutsService],
})
export class AppModule {}
