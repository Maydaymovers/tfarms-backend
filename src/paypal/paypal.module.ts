import { Module } from '@nestjs/common';
import { PayoutsModule } from '../payouts/payouts.module';
import { PaypalController } from './paypal.controller';

@Module({
  imports: [PayoutsModule],
  controllers: [PaypalController],
})
export class PaypalModule {}
