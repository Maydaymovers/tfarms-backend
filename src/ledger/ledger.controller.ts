import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { LedgerQueryDto } from './ledger-query.dto';
import { LedgerService } from './ledger.service';

@UseGuards(ApiKeyGuard)
@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get()
  findAll(@Query() query: LedgerQueryDto) {
    return this.ledgerService.findAll(query);
  }
}
