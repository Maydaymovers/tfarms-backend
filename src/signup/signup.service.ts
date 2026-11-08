import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VendorsService } from '../vendors/vendors.service';
import { PublicSignupDto } from './dto/public-signup.dto';
import { RateLimiter } from './rate-limiter';
import { verifyTurnstile } from './turnstile';

export interface SignupConfig {
  hotelId: string;
  turnstileSiteKey: string;
  turnstileSecret: string;
}

/** Reads the signup settings; null when anything is missing (signup then fails closed). */
export function getSignupConfig(): SignupConfig | null {
  const hotelId = process.env.SIGNUP_HOTEL_ID?.trim();
  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY?.trim();
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!hotelId || !turnstileSiteKey || !turnstileSecret) return null;
  return { hotelId, turnstileSiteKey, turnstileSecret };
}

@Injectable()
export class SignupService {
  private readonly perIp = new RateLimiter(5, 60 * 60 * 1000);
  private readonly global = new RateLimiter(300, 60 * 60 * 1000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vendors: VendorsService,
  ) {}

  /**
   * Public vendor signup. The hotel is fixed by SIGNUP_HOTEL_ID, never by the
   * visitor, and the vendor is always created PENDING. Returns nothing about
   * existing records.
   */
  async signup(dto: PublicSignupDto, ip: string, idempotencyKey?: string): Promise<{ ok: true }> {
    const config = getSignupConfig();
    if (!config) throw new ServiceUnavailableException('Signup is not available right now');

    if (!this.global.allow('all') || !this.perIp.allow(ip)) {
      throw new HttpException('Too many signups. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Bots fill the hidden field. Pretend it worked and store nothing.
    if (dto.website && dto.website.trim() !== '') return { ok: true };

    if (!(await verifyTurnstile(config.turnstileSecret, dto.turnstileToken, ip))) {
      throw new BadRequestException('Verification failed. Please reload the page and try again.');
    }

    const hotel = await this.prisma.hotel.findUnique({ where: { id: config.hotelId } });
    if (!hotel) throw new ServiceUnavailableException('Signup is not available right now');

    // Same email already signed up for this hotel: report success, create nothing.
    const existing = await this.prisma.vendor.findFirst({
      where: { hotelId: config.hotelId, contactEmail: { equals: dto.contactEmail, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) return { ok: true };

    await this.vendors.onboard(dto.name, dto.contactEmail, config.hotelId, idempotencyKey);
    return { ok: true };
  }
}
