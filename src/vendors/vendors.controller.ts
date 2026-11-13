import { Body, Controller, ForbiddenException, Get, Headers, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { HotelRole } from '@prisma/client';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentHotel, HotelAccessGuard, Roles, ServiceOnly } from '../auth/hotel-access.guard';
import { HotelContext, scopeOf } from '../auth/hotel-context';
import { PayoutsService } from '../payouts/payouts.service';
import { UpdateVendorStatusDto } from './dto/update-vendor-status.dto';
import { AssignHotelDto } from './dto/assign-hotel.dto';
import { SetPaypalEmailDto } from './dto/set-paypal-email.dto';
import { SetQboVendorIdDto } from './dto/set-qbo-vendor-id.dto';
import { OnboardVendorDto } from './dto/onboard-vendor.dto';
import { VendorsService } from './vendors.service';

@Controller('vendors')
@UseGuards(ApiKeyGuard, HotelAccessGuard)
export class VendorsController {
  constructor(
    private readonly vendorsService: VendorsService,
    private readonly payoutsService: PayoutsService,
  ) {}

  @Get()
  async findAll(@CurrentHotel() hotel: HotelContext | null) {
    return this.vendorsService.findAll(scopeOf(hotel));
  }

  @Get('unassigned')
  @ServiceOnly()
  async findUnassigned() {
    return this.vendorsService.findUnassigned();
  }

  @Get('count')
  async count(@CurrentHotel() hotel: HotelContext | null) {
    return this.vendorsService.count(scopeOf(hotel));
  }

  @Put(':id/hotel')
  @ServiceOnly()
  async assignHotel(@Param('id') id: string, @Body() body: AssignHotelDto) {
    return this.vendorsService.assignToHotel(id, body.hotelId);
  }

  /** Platform admin only: payouts go to this address, so hotels cannot change it. */
  @Put(':id/paypal-email')
  @ServiceOnly()
  async setPaypalEmail(@Param('id') id: string, @Body() body: SetPaypalEmailDto) {
    return this.vendorsService.setPaypalEmail(id, body.paypalEmail);
  }

  /** Platform admin only: the QuickBooks vendor whose Bills this vendor's payouts settle. */
  @Put(':id/qbo-vendor-id')
  @ServiceOnly()
  async setQboVendorId(@Param('id') id: string, @Body() body: SetQboVendorIdDto) {
    return this.vendorsService.setQboVendorId(id, body.qboVendorId);
  }

  @Post('onboard')
  @Roles(HotelRole.OWNER, HotelRole.MANAGER)
  async onboard(
    @Body() body: OnboardVendorDto,
    @CurrentHotel() hotel: HotelContext | null,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.vendorsService.onboard(
      body.name,
      body.contactEmail,
      hotel ? hotel.hotelId : body.hotelId,
      idempotencyKey?.trim() || undefined,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentHotel() hotel: HotelContext | null) {
    return this.vendorsService.findOne(id, scopeOf(hotel));
  }

  @Get(':id/status-history')
  async statusHistory(@Param('id') id: string, @CurrentHotel() hotel: HotelContext | null) {
    return this.vendorsService.statusHistory(id, scopeOf(hotel));
  }

  /**
   * Allowed: hotel OWNER and MANAGER (their own hotel only) and platform admin
   * (API key with no member header). Every change is written to the audit log.
   */
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateVendorStatusDto,
    @CurrentHotel() hotel: HotelContext | null,
  ) {
    if (hotel && hotel.role !== HotelRole.OWNER && hotel.role !== HotelRole.MANAGER) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'STATUS_CHANGE_NOT_AUTHORIZED',
        message: 'Your role cannot change vendor status',
      });
    }
    const changedBy = hotel ? `member:${hotel.memberId}` : 'platform_admin';
    return this.vendorsService.changeStatus(id, body.status, changedBy, body.reason, scopeOf(hotel));
  }

  @Get(':id/health')
  async getHealth(@Param('id') id: string, @CurrentHotel() hotel: HotelContext | null) {
    return this.vendorsService.getHealth(id, scopeOf(hotel));
  }

  @Get(':id/payouts')
  async findPayouts(@Param('id') id: string, @CurrentHotel() hotel: HotelContext | null) {
    return this.payoutsService.findByVendor(id, scopeOf(hotel));
  }
}
