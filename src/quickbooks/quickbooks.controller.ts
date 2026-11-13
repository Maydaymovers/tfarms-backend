import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { HotelAccessGuard, ServiceOnly } from '../auth/hotel-access.guard';
import { QuickbooksService } from './quickbooks.service';

@Controller('quickbooks')
export class QuickbooksController {
  constructor(private readonly qbo: QuickbooksService) {}

  /** Platform admin: returns the URL to open once to authorize the QuickBooks company. */
  @Get('connect-url')
  @UseGuards(ApiKeyGuard, HotelAccessGuard)
  @ServiceOnly()
  connectUrl() {
    return { url: this.qbo.authorizeUrl() };
  }

  /** Public redirect target from Intuit; protected by the signed state. */
  @Get('callback')
  async callback(@Query('code') code: string, @Query('realmId') realmId: string, @Query('state') state: string) {
    if (!code || !realmId || !state) throw new BadRequestException('Missing code, realmId or state');
    await this.qbo.handleCallback(code, realmId, state);
    return 'QuickBooks connected. You can close this tab.';
  }
}
