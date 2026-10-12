import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { StartOnboardingDto } from './dto/start-onboarding.dto';
import { VendorOnboardingService } from './vendor-onboarding.service';

@Controller('vendor/onboarding')
@UseGuards(ApiKeyGuard)
export class VendorOnboardingController {
  constructor(private readonly vendorOnboardingService: VendorOnboardingService) {}

  @Post('start')
  async start(@Body() body: StartOnboardingDto) {
    return this.vendorOnboardingService.start(body);
  }
}
