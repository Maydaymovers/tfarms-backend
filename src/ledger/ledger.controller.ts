import { Controller, Get, Query } from '@nestjs/common';
import { LedgerQueryDto } from './ledger-query.dto';
import { LedgerService } from './ledger.service';

@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get()
  findAll(@Query() query: LedgerQueryDto) {
    return this.ledgerService.findAll(query);
  }
}
