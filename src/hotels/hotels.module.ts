import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [HotelsController],
  providers: [HotelsService],
})
export class HotelsModule {}
