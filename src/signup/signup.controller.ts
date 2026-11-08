import { Body, Controller, Get, Headers, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PublicSignupDto } from './dto/public-signup.dto';
import { newNonce, signupPage, unavailablePage } from './signup.page';
import { getSignupConfig, SignupService } from './signup.service';

/** Rightmost X-Forwarded-For entry is the address the platform proxy saw. */
export function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  const last = (Array.isArray(xff) ? xff.join(',') : xff ?? '').split(',').pop()?.trim();
  return last || req.socket.remoteAddress || 'unknown';
}

/** Public routes: no API key. Protected by Turnstile, a honeypot and rate limits. */
@Controller()
export class SignupController {
  constructor(private readonly signupService: SignupService) {}

  @Get('signup')
  page(@Res() res: Response) {
    const config = getSignupConfig();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!config) {
      res.status(503).type('html').send(unavailablePage());
      return;
    }
    const nonce = newNonce();
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; script-src 'nonce-${nonce}' https://challenges.cloudflare.com; ` +
        `frame-src https://challenges.cloudflare.com; style-src 'unsafe-inline'; ` +
        `connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors *`,
    );
    res.type('html').send(signupPage(config.turnstileSiteKey, nonce));
  }

  @Post('public/vendor-signup')
  async signup(
    @Body() body: PublicSignupDto,
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.signupService.signup(body, clientIp(req), idempotencyKey?.trim() || undefined);
  }
}
