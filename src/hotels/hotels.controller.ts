import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentHotel, HotelAccessGuard, ServiceOnly } from '../auth/hotel-access.guard';
import { HotelContext } from '../auth/hotel-context';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { HotelsService } from './hotels.service';

@Controller('hotels')
@UseGuards(ApiKeyGuard, HotelAccessGuard)
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  /** The calling member's hotel and role. Requires X-Wix-Member-Id. */
  @Get('me')
  async me(@CurrentHotel() hotel: HotelContext | null) {
    if (!hotel) {
      throw new BadRequestException('X-Wix-Member-Id header is required');
    }
    return this.hotelsService.me(hotel.hotelId, hotel.memberId);
  }

  @Get()
  @ServiceOnly()
  async findAll() {
    return this.hotelsService.findAll();
  }

  @Post()
  @ServiceOnly()
  async create(@Body() body: CreateHotelDto) {
    return this.hotelsService.create(body.name);
  }

  @Post(':id/members')
  @ServiceOnly()
  async addMember(@Param('id') id: string, @Body() body: AddMemberDto) {
    return this.hotelsService.addMember(id, body.wixMemberId, body.role);
  }
}
