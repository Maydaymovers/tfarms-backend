import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

@Injectable()
export class QuickbooksService {
  private readonly log = new Logger(QuickbooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  isConfigured(): boolean {
    return !!(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET && process.env.QBO_BANK_ACCOUNT_ID);
  }

  private get apiBase(): string {
    return process.env.QBO_ENV === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';
  }

  private get redirectUri(): string {
    return process.env.QBO_REDIRECT_URI ?? '';
  }

  private basic(): string {
    return Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64');
  }

  private sign(value: string): string {
    return createHmac('sha256', process.env.QBO_CLIENT_SECRET ?? '').update(value).digest('hex');
  }

  /** URL the admin opens once to authorize the company. state is signed and expires in 10 minutes. */
  authorizeUrl(): string {
    if (!process.env.QBO_CLIENT_ID || !this.redirectUri) {
      throw new ServiceUnavailableException('QBO_CLIENT_ID and QBO_REDIRECT_URI must be set');
    }
    const ts = Date.now().toString();
    const state = `${ts}.${this.sign(ts)}`;
    const q = new URLSearchParams({
      client_id: process.env.QBO_CLIENT_ID,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: this.redirectUri,
      state,
    });
    return `https://appcenter.intuit.com/connect/oauth2?${q}`;
  }

  private checkState(state: string): void {
    const [ts, sig] = (state ?? '').split('.');
    const expected = this.sign(ts ?? '');
    const ok =
      !!ts && !!sig && sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok || Date.now() - Number(ts) > 10 * 60_000) throw new BadRequestException('Invalid or expired state');
  }

  async handleCallback(code: string, realmId: string, state: string): Promise<void> {
    this.checkState(state);
    if (process.env.QBO_REALM_ID && realmId !== process.env.QBO_REALM_ID) {
      throw new BadRequestException('Authorized company does not match QBO_REALM_ID');
    }
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { authorization: `Basic ${this.basic()}`, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.redirectUri }),
    });
    if (!res.ok) throw new BadRequestException('QuickBooks rejected the authorization code');
    await this.storeTokens(realmId, (await res.json()) as TokenResponse);
  }

  private async storeTokens(realmId: string, t: TokenResponse): Promise<void> {
    const data = {
      realmId,
      refreshToken: t.refresh_token,
      accessToken: t.access_token,
      expiresAt: new Date(Date.now() + t.expires_in * 1000),
    };
    await this.prisma.quickbooksAuth.upsert({ where: { id: 'default' }, create: { id: 'default', ...data }, update: data });
  }

  /** Intuit rotates the refresh token on every refresh, so the new one is stored each time. */
  private async accessToken(): Promise<{ token: string; realmId: string }> {
    const row = await this.prisma.quickbooksAuth.findUnique({ where: { id: 'default' } });
    if (!row) throw new Error('QuickBooks is not connected');
    if (row.accessToken && row.expiresAt && row.expiresAt.getTime() > Date.now() + 60_000) {
      return { token: row.accessToken, realmId: row.realmId };
    }
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { authorization: `Basic ${this.basic()}`, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: row.refreshToken }),
    });
    if (!res.ok) throw new Error(`QuickBooks token refresh failed (${res.status}); reconnect QuickBooks`);
    const t = (await res.json()) as TokenResponse;
    await this.storeTokens(row.realmId, t);
    return { token: t.access_token, realmId: row.realmId };
  }

  private async api(method: string, path: string, body?: unknown): Promise<any> {
    const { token, realmId } = await this.accessToken();
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(`${this.apiBase}/v3/company/${realmId}${path}${sep}minorversion=70`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`QuickBooks ${method} ${path} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }

  /**
   * Records a completed payout as a BillPayment against the oldest open Bill of
   * the same vendor whose balance equals the payout amount. Never creates a Bill.
   * Best effort: returns null (and logs) when there is nothing safe to post, so
   * the payout itself is never affected. Idempotent per payout.
   */
  async recordPayout(payoutId: string): Promise<string | null> {
    try {
      if (!this.isConfigured()) return null;
      const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
      if (!payout || payout.qboBillPaymentId) return payout?.qboBillPaymentId ?? null;
      const vendor = await this.prisma.vendor.findUnique({ where: { id: payout.vendorId } });
      if (!vendor?.qboVendorId) {
        this.log.warn(`Payout ${payoutId}: vendor has no qboVendorId, not recorded in QuickBooks`);
        return null;
      }
      const amount = payout.amount.toFixed(2);
      const q = encodeURIComponent(
        `select Id, Balance, TotalAmt from Bill where VendorRef = '${vendor.qboVendorId.replace(/[^0-9A-Za-z]/g, '')}' and Balance > '0' orderby TxnDate`,
      );
      const bills: { Id: string; Balance: number }[] = (await this.api('GET', `/query?query=${q}`)).QueryResponse?.Bill ?? [];
      const bill = bills.find((b) => b.Balance.toFixed(2) === amount);
      if (!bill) {
        this.log.warn(`Payout ${payoutId}: no open QuickBooks Bill of ${amount} for the vendor, not recorded`);
        return null;
      }
      const created = await this.api('POST', `/billpayment?requestid=${payout.id}`, {
        VendorRef: { value: vendor.qboVendorId },
        PayType: 'Check',
        CheckPayment: { BankAccountRef: { value: process.env.QBO_BANK_ACCOUNT_ID } },
        TotalAmt: Number(amount),
        PrivateNote: `PayPal payout ${payout.id}`,
        Line: [{ Amount: Number(amount), LinkedTxn: [{ TxnId: bill.Id, TxnType: 'Bill' }] }],
      });
      const id: string = created.BillPayment.Id;
      await this.prisma.payout.update({ where: { id: payoutId }, data: { qboBillPaymentId: id } });
      return id;
    } catch (err) {
      this.log.error(`Payout ${payoutId}: QuickBooks recording failed: ${(err as Error).message}`);
      return null;
    }
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}
