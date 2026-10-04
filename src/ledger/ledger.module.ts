import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';

@Module({
  imports: [PrismaModule],
  controllers: [LedgerController],
  providers: [LedgerService],
})
export class LedgerModule {}
