import { Controller, Get, Post, Body, Param, Put, UseGuards } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { AchRoutingService } from './routing/ach-routing.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { UpdatePayoutStatusDto } from './dto/update-payout-status.dto';
import { RoutingInputDto } from './dto/routing-input.dto';

@UseGuards(ApiKeyGuard)
@Controller('payouts')
export class PayoutsController {
  constructor(
    private readonly payoutsService: PayoutsService,
    private readonly achRoutingService: AchRoutingService,
  ) {}

  @Get()
  async findAll() {
    return this.payoutsService.findAll();
  }

  @Get('pending')
  async getPending() {
    return this.payoutsService.getPendingPayouts();
  }

  @Post('route')
  route(@Body() body: RoutingInputDto) {
    return this.achRoutingService.decide(body);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.payoutsService.findById(id);
  }

  @Get('vendor/:vendorId')
  async findByVendor(@Param('vendorId') vendorId: string) {
    return this.payoutsService.findByVendor(vendorId);
  }

  @Post()
  async create(@Body() body: CreatePayoutDto) {
    return this.payoutsService.create(body.vendorId, body.amount, body.rail);
  }

  @Put(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: UpdatePayoutStatusDto) {
    return this.payoutsService.updateStatus(id, body.status, body.externalTransactionId, body.failureReason);
  }

  @Get('rail/:rail/pending')
  async getPendingByRail(@Param('rail') rail: string) {
    const payouts = await this.payoutsService.getPendingPayouts();
    return payouts.filter((payout) => payout.rail === rail.trim().toUpperCase());
  }
}
