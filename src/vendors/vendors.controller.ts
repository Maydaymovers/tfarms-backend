import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { HotelRole } from '@prisma/client';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentHotel, HotelAccessGuard, Roles, ServiceOnly } from '../auth/hotel-access.guard';
import { HotelContext, scopeOf } from '../auth/hotel-context';
import { PayoutsService } from '../payouts/payouts.service';
import { AssignHotelDto } from './dto/assign-hotel.dto';
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

  @Get('count')
  async count(@CurrentHotel() hotel: HotelContext | null) {
    return this.vendorsService.count(scopeOf(hotel));
  }

  @Put(':id/hotel')
  @ServiceOnly()
  async assignHotel(@Param('id') id: string, @Body() body: AssignHotelDto) {
    return this.vendorsService.assignToHotel(id, body.hotelId);
  }

  @Post('onboard')
  @Roles(HotelRole.OWNER, HotelRole.MANAGER)
  async onboard(@Body() body: OnboardVendorDto, @CurrentHotel() hotel: HotelContext | null) {
    return this.vendorsService.onboard(body.name, body.contactEmail, hotel ? hotel.hotelId : body.hotelId);
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
