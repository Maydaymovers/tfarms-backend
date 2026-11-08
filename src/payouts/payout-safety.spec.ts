import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

// Needs a real Postgres with migrations applied: HOTEL_TEST_DATABASE_URL=postgresql://...
const dbUrl = process.env.HOTEL_TEST_DATABASE_URL;
const maybe = dbUrl ? describe : describe.skip;

maybe('payout safety (database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  const KEY = 'test-key';
  const run = Date.now().toString(36);
  let n = 0;
  const call = async (
    method: string,
    path: string,
    opts: { member?: string; body?: unknown; idem?: string | null } = {},
  ) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-api-key': KEY,
        ...(opts.member ? { 'x-wix-member-id': opts.member } : {}),
        ...(opts.idem === null ? {} : { 'idempotency-key': opts.idem ?? `k-${run}-${n++}` }),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  let hotelA: string;
  let hotelB: string;
  let vendorA: string;
  let vendorB: string;
  const ownerA = `psOwnerA-${run}`;
  const ownerB = `psOwnerB-${run}`;
  const legacyVendor = `legacy-${run}`;

  const newPayout = async (vendorId = vendorA, amount = '10.00') =>
    (await call('POST', '/payouts', { body: { vendorId, amount, rail: 'ACH' } })).body;

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    process.env.API_KEYS = KEY;
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.listen(0);
    base = (await app.getUrl()).replace('[::1]', 'localhost');
    prisma = app.get(PrismaService);

    hotelA = (await call('POST', '/hotels', { body: { name: 'PS-A' }, idem: null })).body.id;
    hotelB = (await call('POST', '/hotels', { body: { name: 'PS-B' }, idem: null })).body.id;
    await call('POST', `/hotels/${hotelA}/members`, { body: { wixMemberId: ownerA, role: 'OWNER' }, idem: null });
    await call('POST', `/hotels/${hotelB}/members`, { body: { wixMemberId: ownerB, role: 'OWNER' }, idem: null });
    vendorA = (await call('POST', '/vendors/onboard', { member: ownerA, body: { name: 'VA' } })).body.id;
    vendorB = (await call('POST', '/vendors/onboard', { member: ownerB, body: { name: 'VB' } })).body.id;
  });

  afterAll(async () => {
    const hotels = [hotelA, hotelB];
    await prisma.payout.deleteMany({ where: { OR: [{ hotelId: { in: hotels } }, { vendorId: legacyVendor }] } });
    await prisma.vendor.deleteMany({ where: { hotelId: { in: hotels } } });
    await prisma.idempotencyKey.deleteMany({
      where: { scope: { in: [...hotels, ...hotels.map((h) => `payout:${h}`), 'payout:service'] }, key: { startsWith: `k-${run}` } },
    });
    await prisma.hotel.deleteMany({ where: { id: { in: hotels } } });
    await app.close();
  });

  describe('POST /payouts idempotency', () => {
    it('requires the Idempotency-Key header', async () => {
      const res = await call('POST', '/payouts', { idem: null, body: { vendorId: vendorA, amount: '5.00', rail: 'ACH' } });
      expect(res.status).toBe(400);
    });

    it('a retry returns the first payout and creates no second one', async () => {
      const body = { vendorId: vendorA, amount: '12.50', rail: 'ach' };
      const first = await call('POST', '/payouts', { member: ownerA, idem: `k-${run}-retry`, body });
      const second = await call('POST', '/payouts', { member: ownerA, idem: `k-${run}-retry`, body });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);
      expect(await prisma.payout.count({ where: { vendorId: vendorA, amount: '12.50' } })).toBe(1);
    });

    it('concurrent requests with one key create exactly one payout', async () => {
      const body = { vendorId: vendorA, amount: '33.33', rail: 'ACH' };
      const results = await Promise.all(
        Array.from({ length: 6 }, () => call('POST', '/payouts', { member: ownerA, idem: `k-${run}-race`, body })),
      );
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(await prisma.payout.count({ where: { vendorId: vendorA, amount: '33.33' } })).toBe(1);
    });

    it('rejects the same key with a different body', async () => {
      const key = `k-${run}-diff`;
      await call('POST', '/payouts', { member: ownerA, idem: key, body: { vendorId: vendorA, amount: '1.00', rail: 'ACH' } });
      const res = await call('POST', '/payouts', { member: ownerA, idem: key, body: { vendorId: vendorA, amount: '2.00', rail: 'ACH' } });
      expect(res.status).toBe(422);
    });
  });

  describe('ownership on every create path', () => {
    it('a member cannot pay another hotel\'s vendor', async () => {
      const res = await call('POST', '/payouts', { member: ownerB, body: { vendorId: vendorA, amount: '5.00', rail: 'ACH' } });
      expect(res.status).toBe(404);
    });

    it('a member cannot pay a vendor that is not onboarded', async () => {
      const res = await call('POST', '/payouts', { member: ownerA, body: { vendorId: legacyVendor, amount: '5.00', rail: 'ACH' } });
      expect(res.status).toBe(404);
    });

    it('a service call is stamped with the vendor\'s hotel and rejects a mismatched hotelId', async () => {
      const ok = await call('POST', '/payouts', { body: { vendorId: vendorB, amount: '5.00', rail: 'ACH' } });
      expect(ok.status).toBe(201);
      expect(ok.body.hotelId).toBe(hotelB);
      const bad = await call('POST', '/payouts', { body: { vendorId: vendorB, amount: '5.00', rail: 'ACH', hotelId: hotelA } });
      expect(bad.status).toBe(400);
    });

    it('a service call for a legacy vendorId (not onboarded) still works', async () => {
      const res = await call('POST', '/payouts', { body: { vendorId: legacyVendor, amount: '5.00', rail: 'ACH' } });
      expect(res.status).toBe(201);
    });

    it('rejects zero and malformed amounts', async () => {
      for (const amount of ['0', '0.00', '-1', '1.234', 'abc']) {
        const res = await call('POST', '/payouts', { body: { vendorId: vendorA, amount, rail: 'ACH' } });
        expect(res.status).toBe(400);
      }
    });
  });

  describe('status transitions', () => {
    const set = (id: string, status: string, extra: object = {}, member?: string) =>
      call('PUT', `/payouts/${id}/status`, { member, body: { status, ...extra } });

    it('walks PENDING -> PROCESSING -> COMPLETED and records history', async () => {
      const p = await newPayout();
      expect((await set(p.id, 'PROCESSING', {}, ownerA)).status).toBe(200);
      const done = await set(p.id, 'COMPLETED', { externalTransactionId: 'ext-1' });
      expect(done.body).toMatchObject({ status: 'COMPLETED', externalTransactionId: 'ext-1' });
      const hist = (await call('GET', `/payouts/${p.id}/status-history`)).body as {
        oldStatus: string; newStatus: string; changedBy: string;
      }[];
      expect(hist.map((h) => `${h.oldStatus}>${h.newStatus}`)).toEqual(['PENDING>PROCESSING', 'PROCESSING>COMPLETED']);
      expect(hist[0].changedBy).toMatch(/^member:/);
      expect(hist[1].changedBy).toBe('platform_admin');
    });

    it('rejects illegal moves with 409 and leaves the payout unchanged', async () => {
      const p = await newPayout();
      for (const status of ['COMPLETED', 'REVERSED', 'PENDING']) {
        const res = await set(p.id, status, { reason: 'x' });
        expect([409, 403]).toContain(res.status);
      }
      expect((await set(p.id, 'COMPLETED')).body.code).toBe('INVALID_PAYOUT_TRANSITION');
      expect((await call('GET', `/payouts/${p.id}`)).body.status).toBe('PENDING');
    });

    it('COMPLETED can only go to REVERSED, by platform admin, with a reason', async () => {
      const p = await newPayout();
      await set(p.id, 'PROCESSING');
      await set(p.id, 'COMPLETED');
      expect((await set(p.id, 'PENDING')).status).toBe(409);
      expect((await set(p.id, 'FAILED')).status).toBe(409);
      expect((await set(p.id, 'REVERSED', { reason: 'ACH return' }, ownerA)).status).toBe(403);
      expect((await set(p.id, 'REVERSED')).status).toBe(400);
      const rev = await set(p.id, 'REVERSED', { reason: 'ACH return R01' });
      expect(rev.body.status).toBe('REVERSED');
      expect((await set(p.id, 'PENDING')).status).toBe(409);
      const hist = (await call('GET', `/payouts/${p.id}/status-history`)).body as { reason: string | null }[];
      expect(hist[hist.length - 1].reason).toBe('ACH return R01');
    });

    it('FAILED is final', async () => {
      const p = await newPayout();
      expect((await set(p.id, 'FAILED', { failureReason: 'bank rejected' })).status).toBe(200);
      expect((await set(p.id, 'PENDING')).status).toBe(409);
      expect((await set(p.id, 'PROCESSING')).status).toBe(409);
    });

    it('concurrent conflicting updates: exactly one wins', async () => {
      const p = await newPayout();
      const results = await Promise.all([
        set(p.id, 'PROCESSING'),
        set(p.id, 'FAILED'),
        set(p.id, 'REQUIRES_REVIEW'),
        set(p.id, 'PROCESSING'),
      ]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(3);
      const hist = (await call('GET', `/payouts/${p.id}/status-history`)).body as unknown[];
      expect(hist).toHaveLength(1);
    });

    it('a member cannot touch another hotel\'s payout', async () => {
      const p = await newPayout();
      expect((await set(p.id, 'PROCESSING', {}, ownerB)).status).toBe(404);
      expect((await call('GET', `/payouts/${p.id}/status-history`, { member: ownerB })).status).toBe(404);
    });
  });
});
