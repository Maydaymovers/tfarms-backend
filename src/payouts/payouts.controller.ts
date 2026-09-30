import { Controller, Get, Post, Body, Param, Put } from '@nestjs/common';
import { PayoutsService } from './payouts.service';

@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get()
  async findAll() {
    return this.payoutsService.findAll();
  }

  @Get('pending')
  async getPending() {
    return this.payoutsService.getPendingPayouts();
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
  async create(@Body() body: { vendorId: string; amount: number; rail: string }) {
    return this.payoutsService.create(body.vendorId, body.amount, body.rail);
  }

  @Put(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: { status: string; externalTransactionId?: string; failureReason?: string }) {
    return this.payoutsService.updateStatus(id, body.status, body.externalTransactionId, body.failureReason);
  }

  @Get('rail/:rail/pending')
  async getPendingByRail(@Param('rail') rail: string) {
    const payouts = await this.payoutsService.getPendingPayouts();
    return payouts.filter(p => p.rail === rail);
  }
}
