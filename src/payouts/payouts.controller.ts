import { Controller, ForbiddenException, Get, Headers, Post, Body, Param, Put, UseGuards } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { AchRoutingService } from './routing/ach-routing.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentHotel, HotelAccessGuard, Roles } from '../auth/hotel-access.guard';
import { HotelContext, scopeOf } from '../auth/hotel-context';
import { HotelRole, PayoutStatus } from '@prisma/client';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { UpdatePayoutStatusDto } from './dto/update-payout-status.dto';
import { RoutingInputDto } from './dto/routing-input.dto';

@Controller('payouts')
@UseGuards(ApiKeyGuard, HotelAccessGuard)
export class PayoutsController {
  constructor(
    private readonly payoutsService: PayoutsService,
    private readonly achRoutingService: AchRoutingService,
  ) {}

  @Get()
  async findAll(@CurrentHotel() hotel: HotelContext | null) {
    return this.payoutsService.findAll(scopeOf(hotel));
  }

  @Get('pending')
  async getPending(@CurrentHotel() hotel: HotelContext | null) {
    return this.payoutsService.getPendingPayouts(scopeOf(hotel));
  }

  @Post('route')
  route(@Body() body: RoutingInputDto) {
    return this.achRoutingService.decide(body);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentHotel() hotel: HotelContext | null) {
    return this.payoutsService.findById(id, scopeOf(hotel));
  }

  @Get('vendor/:vendorId')
  async findByVendor(@Param('vendorId') vendorId: string, @CurrentHotel() hotel: HotelContext | null) {
    return this.payoutsService.findByVendor(vendorId, scopeOf(hotel));
  }

  @Get(':id/status-history')
  async statusHistory(@Param('id') id: string, @CurrentHotel() hotel: HotelContext | null) {
    return this.payoutsService.statusHistory(id, scopeOf(hotel));
  }

  /** Idempotency-Key header is required: a retry with the same key returns the first payout. */
  @Post()
  @Roles(HotelRole.OWNER, HotelRole.MANAGER)
  async create(
    @Body() body: CreatePayoutDto,
    @CurrentHotel() hotel: HotelContext | null,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    // Member requests always use their own hotel; body.hotelId is honored only for service requests.
    return this.payoutsService.create(
      body.vendorId,
      body.amount,
      body.rail,
      scopeOf(hotel),
      idempotencyKey,
      hotel ? undefined : body.hotelId,
    );
  }

  /** Sends a PENDING PayPal-rail payout through PayPal. Completion arrives by webhook. */
  @Post(':id/send')
  @Roles(HotelRole.OWNER, HotelRole.MANAGER)
  async send(@Param('id') id: string, @CurrentHotel() hotel: HotelContext | null) {
    const changedBy = hotel ? `member:${hotel.memberId}` : 'platform_admin';
    return this.payoutsService.sendViaPaypal(id, changedBy, scopeOf(hotel));
  }

  @Put(':id/status')
  @Roles(HotelRole.OWNER, HotelRole.MANAGER)
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdatePayoutStatusDto,
    @CurrentHotel() hotel: HotelContext | null,
  ) {
    // Reversing a completed payout is a platform admin action (API key, no member header).
    if (hotel && body.status === PayoutStatus.REVERSED) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'REVERSAL_NOT_AUTHORIZED',
        message: 'Only platform admin can reverse a payout',
      });
    }
    const changedBy = hotel ? `member:${hotel.memberId}` : 'platform_admin';
    return this.payoutsService.updateStatus(
      id,
      body.status,
      changedBy,
      { externalTransactionId: body.externalTransactionId, failureReason: body.failureReason, reason: body.reason },
      scopeOf(hotel),
    );
  }

  @Get('rail/:rail/pending')
  async getPendingByRail(@Param('rail') rail: string, @CurrentHotel() hotel: HotelContext | null) {
    const payouts = await this.payoutsService.getPendingPayouts(scopeOf(hotel));
    return payouts.filter((payout) => payout.rail === rail.trim().toUpperCase());
  }
}
