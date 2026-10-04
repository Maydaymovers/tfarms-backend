import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { LedgerQueryDto } from './ledger-query.dto';
import { LedgerService } from './ledger.service';

@Controller('ledger')
@UseGuards(ApiKeyGuard)
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get()
  findAll(@Query() query: LedgerQueryDto) {
    return this.ledgerService.findAll(query);
  }
}
