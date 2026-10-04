import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyStrategy } from './api-key.strategy';

@Module({
  imports: [PassportModule],
  providers: [ApiKeyStrategy, ApiKeyGuard],
  exports: [ApiKeyGuard],
})
export class AuthModule {}
