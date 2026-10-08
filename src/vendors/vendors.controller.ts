import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { PayoutsService } from '../payouts/payouts.service';
import { OnboardVendorDto } from './dto/onboard-vendor.dto';
import { VendorsService } from './vendors.service';

@Controller('vendors')
@UseGuards(ApiKeyGuard)
export class VendorsController {
  constructor(
    private readonly vendorsService: VendorsService,
    private readonly payoutsService: PayoutsService,
  ) {}

  @Get()
  async findAll() {
    return this.vendorsService.findAll();
  }

  @Post('onboard')
  async onboard(@Body() body: OnboardVendorDto) {
    return this.vendorsService.onboard(body.name, body.contactEmail);
  }

  @Get(':id/health')
  async getHealth(@Param('id') id: string) {
    return this.vendorsService.getHealth(id);
  }

  @Get(':id/payouts')
  async findPayouts(@Param('id') id: string) {
    return this.payoutsService.findByVendor(id);
  }
}
