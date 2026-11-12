import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface PaypalPayoutRequest {
  payoutId: string;
  amount: string;
  currency: string;
  receiverEmail: string;
}

export class PaypalRejectedError extends Error {}

@Injectable()
export class PaypalService {
  private token: { value: string; expiresAt: number } | null = null;

  private get baseUrl(): string {
    return process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  }

  isConfigured(): boolean {
    return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  }

  private async accessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('PayPal is not configured');
    }
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new ServiceUnavailableException('PayPal authentication failed');
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  /**
   * Sends one payout. sender_batch_id is the payout id, so PayPal rejects a
   * duplicate batch instead of paying twice if we retry. Returns the PayPal
   * payout_batch_id. Throws PaypalRejectedError when PayPal refuses the request
   * (nothing was sent); any other error means the outcome is unknown.
   */
  async sendPayout(req: PaypalPayoutRequest): Promise<string> {
    const token = await this.accessToken();
    const res = await fetch(`${this.baseUrl}/v1/payments/payouts`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: req.payoutId,
          email_subject: 'You have a payment',
        },
        items: [
          {
            recipient_type: 'EMAIL',
            receiver: req.receiverEmail,
            amount: { value: req.amount, currency: req.currency },
            sender_item_id: req.payoutId,
          },
        ],
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      batch_header?: { payout_batch_id?: string };
      name?: string;
      message?: string;
    };
    if (res.status === 201 || res.status === 200) {
      const id = body.batch_header?.payout_batch_id;
      if (!id) throw new Error('PayPal response had no payout_batch_id');
      return id;
    }
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new PaypalRejectedError(`${body.name ?? res.status}: ${body.message ?? 'rejected'}`);
    }
    throw new Error(`PayPal error ${res.status}`);
  }

  /** Verifies a webhook with PayPal's verify-webhook-signature API. Fails closed. */
  async verifyWebhook(headers: Record<string, string | string[] | undefined>, event: unknown): Promise<boolean> {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId || !this.isConfigured()) return false;
    const h = (name: string) => {
      const v = headers[name];
      return Array.isArray(v) ? v[0] : v;
    };
    try {
      const token = await this.accessToken();
      const res = await fetch(`${this.baseUrl}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          auth_algo: h('paypal-auth-algo'),
          cert_url: h('paypal-cert-url'),
          transmission_id: h('paypal-transmission-id'),
          transmission_sig: h('paypal-transmission-sig'),
          transmission_time: h('paypal-transmission-time'),
          webhook_id: webhookId,
          webhook_event: event,
        }),
      });
      if (!res.ok) return false;
      return ((await res.json()) as { verification_status?: string }).verification_status === 'SUCCESS';
    } catch {
      return false;
    }
  }
}
