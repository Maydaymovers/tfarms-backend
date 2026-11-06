import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { HotelRole } from '@prisma/client';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentHotel, HotelAccessGuard, Roles } from '../auth/hotel-access.guard';
import { HotelContext } from '../auth/hotel-context';
import { StartOnboardingDto } from './dto/start-onboarding.dto';
import { VendorOnboardingService } from './vendor-onboarding.service';

@Controller('vendor/onboarding')
@UseGuards(ApiKeyGuard, HotelAccessGuard)
export class VendorOnboardingController {
  constructor(private readonly vendorOnboardingService: VendorOnboardingService) {}

  @Post('start')
  @Roles(HotelRole.OWNER, HotelRole.MANAGER)
  async start(@Body() body: StartOnboardingDto, @CurrentHotel() hotel: HotelContext | null) {
    return this.vendorOnboardingService.start(body, hotel?.hotelId);
  }
}
