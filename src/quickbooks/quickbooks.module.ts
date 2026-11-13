import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QuickbooksController } from './quickbooks.controller';
import { QuickbooksService } from './quickbooks.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [QuickbooksController],
  providers: [QuickbooksService],
  exports: [QuickbooksService],
})
export class QuickbooksModule {}
