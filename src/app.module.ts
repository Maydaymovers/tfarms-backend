import { Module } from '@nestjs/common';
import { PayoutsModule } from './payouts/payouts.module';

@Module({
  imports: [PayoutsModule],
})
export class AppModule {}
