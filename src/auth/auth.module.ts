import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyStrategy } from './api-key.strategy';
import { HotelAccessGuard } from './hotel-access.guard';

@Module({
  imports: [PassportModule],
  providers: [ApiKeyStrategy, ApiKeyGuard, HotelAccessGuard],
  exports: [ApiKeyGuard, HotelAccessGuard],
})
export class AuthModule {}
