import { Controller, Get, Post, Body, Param, Put, UseGuards } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { AchRoutingService } from './routing/ach-routing.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentHotel, HotelAccessGuard, Roles } from '../auth/hotel-access.guard';
import { HotelContext, scopeOf } from '../auth/hotel-context';
import { HotelRole } from '@prisma/client';
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

  @Post()
  @Roles(HotelRole.OWNER, HotelRole.MANAGER)
  async create(@Body() body: CreatePayoutDto, @CurrentHotel() hotel: HotelContext | null) {
    // Member requests always use their own hotel; body.hotelId is honored only for service requests.
    const scope = hotel ? scopeOf(hotel) : { hotelId: body.hotelId };
    return this.payoutsService.create(body.vendorId, body.amount, body.rail, scope);
  }

  @Put(':id/status')
  @Roles(HotelRole.OWNER, HotelRole.MANAGER)
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdatePayoutStatusDto,
    @CurrentHotel() hotel: HotelContext | null,
  ) {
    return this.payoutsService.updateStatus(
      id,
      body.status,
      body.externalTransactionId,
      body.failureReason,
      scopeOf(hotel),
    );
  }

  @Get('rail/:rail/pending')
  async getPendingByRail(@Param('rail') rail: string, @CurrentHotel() hotel: HotelContext | null) {
    const payouts = await this.payoutsService.getPendingPayouts(scopeOf(hotel));
    return payouts.filter((payout) => payout.rail === rail.trim().toUpperCase());
  }
}
