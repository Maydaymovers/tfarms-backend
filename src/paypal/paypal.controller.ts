import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { PayoutsService } from '../payouts/payouts.service';
import { PaypalService } from './paypal.service';

interface PaypalEvent {
  event_type?: string;
  resource?: { payout_item?: { sender_item_id?: string }; payout_item_id?: string; payout_batch_id?: string; errors?: { message?: string } };
}

/** Public endpoint: authenticated by PayPal's signature, not the API key. */
@Controller('paypal')
export class PaypalController {
  constructor(
    private readonly paypal: PaypalService,
    private readonly payouts: PayoutsService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Headers() headers: Record<string, string | string[] | undefined>, @Body() event: PaypalEvent) {
    if (!(await this.paypal.verifyWebhook(headers, event))) {
      throw new UnauthorizedException('Invalid PayPal webhook signature');
    }
    const payoutId = event.resource?.payout_item?.sender_item_id;
    if (!event.event_type || !payoutId) return { handled: false };
    const reason = event.resource?.errors?.message ?? event.event_type;
    switch (event.event_type) {
      case 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED':
        await this.payouts.applyProviderOutcome(payoutId, 'COMPLETED', reason);
        break;
      case 'PAYMENT.PAYOUTS-ITEM.FAILED':
      case 'PAYMENT.PAYOUTS-ITEM.DENIED':
      case 'PAYMENT.PAYOUTS-ITEM.BLOCKED':
      case 'PAYMENT.PAYOUTS-ITEM.CANCELED':
        await this.payouts.applyProviderOutcome(payoutId, 'FAILED', reason);
        break;
      case 'PAYMENT.PAYOUTS-ITEM.RETURNED':
      case 'PAYMENT.PAYOUTS-ITEM.REFUNDED':
        await this.payouts.applyProviderOutcome(payoutId, 'REVERSED', reason);
        break;
      default:
        return { handled: false };
    }
    return { handled: true };
  }
}
