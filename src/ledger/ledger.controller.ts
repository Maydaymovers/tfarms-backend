import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentHotel, HotelAccessGuard } from '../auth/hotel-access.guard';
import { HotelContext, scopeOf } from '../auth/hotel-context';
import { LedgerQueryDto } from './ledger-query.dto';
import { LedgerService } from './ledger.service';

@Controller('ledger')
@UseGuards(ApiKeyGuard, HotelAccessGuard)
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get()
  findAll(@Query() query: LedgerQueryDto, @CurrentHotel() hotel: HotelContext | null) {
    return this.ledgerService.findAll(query, scopeOf(hotel));
  }
}
