import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PublicSignupDto } from './dto/public-signup.dto';
import { RateLimiter } from './rate-limiter';
import { SignupService } from './signup.service';
import { clientIp } from './signup.controller';
import { signupPage } from './signup.page';

const dto = (over: Partial<PublicSignupDto> = {}): PublicSignupDto =>
  plainToInstance(PublicSignupDto, { name: 'ABC Farms', contactEmail: 'o@abc.test', turnstileToken: 'tok', ...over });

function setup() {
  const prisma = {
    hotel: { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-1' }) },
    vendor: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const vendors = { onboard: jest.fn().mockResolvedValue({ id: 'v1' }) };
  const service = new SignupService(prisma as never, vendors as never);
  return { prisma, vendors, service };
}

describe('SignupService', () => {
  const realFetch = global.fetch;
  const turnstile = (success: boolean) =>
    (global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success }) }) as never);

  beforeEach(() => {
    process.env.SIGNUP_HOTEL_ID = 'hotel-1';
    process.env.TURNSTILE_SITE_KEY = 'site';
    process.env.TURNSTILE_SECRET_KEY = 'secret';
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  it('creates a vendor in the fixed hotel after Turnstile passes', async () => {
    turnstile(true);
    const { service, vendors } = setup();
    await expect(service.signup(dto(), '1.1.1.1', 'idem-1')).resolves.toEqual({ ok: true });
    expect(vendors.onboard).toHaveBeenCalledWith('ABC Farms', 'o@abc.test', 'hotel-1', 'idem-1');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(init.body)).toContain('secret=secret');
    expect(String(init.body)).toContain('response=tok');
  });

  it('without SIGNUP_HOTEL_ID creates an unassigned vendor and skips the hotel lookup', async () => {
    delete process.env.SIGNUP_HOTEL_ID;
    turnstile(true);
    const { service, vendors, prisma } = setup();
    await expect(service.signup(dto(), '1.1.1.1', 'idem-2')).resolves.toEqual({ ok: true });
    expect(vendors.onboard).toHaveBeenCalledWith('ABC Farms', 'o@abc.test', undefined, 'idem-2');
    expect(prisma.hotel.findUnique).not.toHaveBeenCalled();
    expect(prisma.vendor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ hotelId: null }) }),
    );
  });

  it('fails closed with 503 when a Turnstile key is missing, without calling Turnstile', async () => {
    for (const name of ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY']) {
      const saved = process.env[name];
      delete process.env[name];
      turnstile(true);
      const { service, vendors } = setup();
      await expect(service.signup(dto(), '1.1.1.1')).rejects.toMatchObject({ status: 503 });
      expect(vendors.onboard).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
      process.env[name] = saved;
    }
  });

  it('rejects a failed Turnstile check and creates nothing', async () => {
    turnstile(false);
    const { service, vendors } = setup();
    await expect(service.signup(dto(), '1.1.1.1')).rejects.toMatchObject({ status: 400 });
    expect(vendors.onboard).not.toHaveBeenCalled();
  });

  it('treats a Turnstile outage as a failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as never;
    const { service, vendors } = setup();
    await expect(service.signup(dto(), '1.1.1.1')).rejects.toMatchObject({ status: 400 });
    expect(vendors.onboard).not.toHaveBeenCalled();
  });

  it('answers a filled honeypot with success but stores nothing', async () => {
    turnstile(true);
    const { service, vendors } = setup();
    await expect(service.signup(dto({ website: 'http://spam.test' }), '1.1.1.1')).resolves.toEqual({ ok: true });
    expect(vendors.onboard).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns success without creating a second vendor for a repeat email', async () => {
    turnstile(true);
    const { service, vendors, prisma } = setup();
    prisma.vendor.findFirst.mockResolvedValue({ id: 'old' });
    await expect(service.signup(dto(), '1.1.1.1')).resolves.toEqual({ ok: true });
    expect(vendors.onboard).not.toHaveBeenCalled();
  });

  it('returns 503 when SIGNUP_HOTEL_ID points at no hotel', async () => {
    turnstile(true);
    const { service, prisma } = setup();
    prisma.hotel.findUnique.mockResolvedValue(null);
    await expect(service.signup(dto(), '1.1.1.1')).rejects.toMatchObject({ status: 503 });
  });

  it('limits each IP to 5 signups per hour', async () => {
    turnstile(true);
    const { service } = setup();
    for (let i = 0; i < 5; i++) await service.signup(dto(), '9.9.9.9');
    await expect(service.signup(dto(), '9.9.9.9')).rejects.toMatchObject({ status: 429 });
    await expect(service.signup(dto(), '8.8.8.8')).resolves.toEqual({ ok: true });
  });
});

describe('DTO', () => {
  it('requires name, a valid email and a token, and trims', async () => {
    expect(await validate(dto())).toHaveLength(0);
    expect((await validate(dto({ name: '   ' }))).length).toBeGreaterThan(0);
    expect((await validate(dto({ contactEmail: 'nope' }))).length).toBeGreaterThan(0);
    expect((await validate(dto({ turnstileToken: '' }))).length).toBeGreaterThan(0);
    expect(dto({ name: '  X  ' }).name).toBe('X');
  });
});

describe('RateLimiter', () => {
  it('resets after the window', () => {
    let t = 0;
    const rl = new RateLimiter(2, 1000, () => t);
    expect([rl.allow('a'), rl.allow('a'), rl.allow('a')]).toEqual([true, true, false]);
    t = 1001;
    expect(rl.allow('a')).toBe(true);
  });
});

describe('clientIp', () => {
  it('uses the rightmost forwarded address, not a client-supplied first one', () => {
    const req = { headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }, socket: { remoteAddress: '10.0.0.1' } };
    expect(clientIp(req as never)).toBe('203.0.113.9');
    expect(clientIp({ headers: {}, socket: { remoteAddress: '10.0.0.1' } } as never)).toBe('10.0.0.1');
  });
});

describe('signup page', () => {
  it('escapes the site key and carries the nonce', () => {
    const html = signupPage('a"><script>x</script>', 'N0NCE');
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('nonce="N0NCE"');
  });
});
