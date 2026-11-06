import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeyStrategy } from '../auth/api-key.strategy';

// Needs a real Postgres with migrations applied: HOTEL_TEST_DATABASE_URL=postgresql://...
const dbUrl = process.env.HOTEL_TEST_DATABASE_URL;
const maybe = dbUrl ? describe : describe.skip;

maybe('hotel isolation (database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  const KEY = 'test-key';
  const run = Date.now().toString(36);
  const call = async (method: string, path: string, member?: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-api-key': KEY,
        ...(member ? { 'x-wix-member-id': member } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  let hotelA: string;
  let hotelB: string;
  const ownerA = `ownerA-${run}`;
  const staffA = `staffA-${run}`;
  const ownerB = `ownerB-${run}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    process.env.API_KEYS = KEY;
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.listen(0);
    base = await app.getUrl();
    base = base.replace('[::1]', 'localhost');
    prisma = app.get(PrismaService);
    void ApiKeyStrategy;

    hotelA = (await call('POST', '/hotels', undefined, { name: 'A' })).body.id;
    hotelB = (await call('POST', '/hotels', undefined, { name: 'B' })).body.id;
    await call('POST', `/hotels/${hotelA}/members`, undefined, { wixMemberId: ownerA, role: 'OWNER' });
    await call('POST', `/hotels/${hotelA}/members`, undefined, { wixMemberId: staffA, role: 'STAFF' });
    await call('POST', `/hotels/${hotelB}/members`, undefined, { wixMemberId: ownerB, role: 'OWNER' });
  });

  afterAll(async () => {
    await prisma.payout.deleteMany({ where: { hotelId: { in: [hotelA, hotelB] } } });
    await prisma.vendor.deleteMany({ where: { hotelId: { in: [hotelA, hotelB] } } });
    await prisma.hotel.deleteMany({ where: { id: { in: [hotelA, hotelB] } } });
    await app.close();
  });

  it('a member cannot join a second hotel', async () => {
    const res = await call('POST', `/hotels/${hotelB}/members`, undefined, { wixMemberId: ownerA });
    expect(res.status).toBe(409);
  });

  it('unknown members and member calls to admin routes are rejected', async () => {
    expect((await call('GET', '/payouts', `nobody-${run}`)).status).toBe(403);
    expect((await call('POST', '/hotels', ownerA, { name: 'x' })).status).toBe(403);
  });

  it('keeps vendors and payouts inside their hotel', async () => {
    const vendorA = (await call('POST', '/vendors/onboard', ownerA, { name: 'VA' })).body;
    const vendorB = (await call('POST', '/vendors/onboard', ownerB, { name: 'VB' })).body;
    expect(vendorA.hotelId).toBe(hotelA);

    // hotel B cannot pay hotel A's vendor, and a forged body hotelId is ignored
    const cross = await call('POST', '/payouts', ownerB, { vendorId: vendorA.id, amount: '5.00', rail: 'ACH' });
    expect(cross.status).toBe(404);
    const forged = await call('POST', '/payouts', ownerB, {
      vendorId: vendorB.id, amount: '5.00', rail: 'ACH', hotelId: hotelA,
    });
    expect(forged.status).toBe(201);
    expect(forged.body.hotelId).toBe(hotelB);

    const payoutA = (await call('POST', '/payouts', ownerA, { vendorId: vendorA.id, amount: '9.00', rail: 'ACH' })).body;

    expect((await call('GET', `/payouts/${payoutA.id}`, ownerB)).status).toBe(404);
    expect((await call('PUT', `/payouts/${payoutA.id}/status`, ownerB, { status: 'FAILED' })).status).toBe(404);
    expect((await call('GET', `/vendors/${vendorA.id}/health`, ownerB)).status).toBe(404);
    expect((await call('GET', `/vendors/${vendorA.id}/payouts`, ownerB)).body).toEqual([]);

    const listB = (await call('GET', '/payouts', ownerB)).body as { hotelId: string }[];
    expect(listB.length).toBeGreaterThan(0);
    expect(listB.every((p) => p.hotelId === hotelB)).toBe(true);
    const vendorsB = (await call('GET', '/vendors', ownerB)).body as { id: string }[];
    expect(vendorsB.map((v) => v.id)).not.toContain(vendorA.id);
  });

  it('scopes the ledger to the hotel', async () => {
    await prisma.ledgerEntry.create({ data: { type: 'ADJUSTMENT_CREDIT', amount: '1.00', hotelId: hotelA } });
    await prisma.ledgerEntry.create({ data: { type: 'ADJUSTMENT_CREDIT', amount: '2.00', hotelId: hotelB } });
    const a = (await call('GET', '/ledger?limit=200', ownerA)).body;
    expect(a.data.every((e: { hotelId: string }) => e.hotelId === hotelA)).toBe(true);
    expect(a.total).toBe(1);
    await prisma.ledgerEntry.deleteMany({ where: { hotelId: { in: [hotelA, hotelB] } } });
  });

  it('enforces roles: staff can read but not write', async () => {
    expect((await call('GET', '/payouts', staffA)).status).toBe(200);
    expect((await call('POST', '/vendors/onboard', staffA, { name: 'nope' })).status).toBe(403);
    expect((await call('GET', '/hotels/me', staffA)).body).toEqual({ hotel: { id: hotelA, name: 'A' }, role: 'STAFF' });
  });

  it('counts vendors per hotel and assigns existing vendors', async () => {
    const before = (await call('GET', '/vendors/count', ownerA)).body.count;
    const orphan = await prisma.vendor.create({ data: { name: `orphan-${run}` } });
    expect((await call('GET', '/vendors/count', ownerA)).body.count).toBe(before);

    expect((await call('PUT', `/vendors/${orphan.id}/hotel`, ownerA, { hotelId: hotelA })).status).toBe(403);
    const assigned = await call('PUT', `/vendors/${orphan.id}/hotel`, undefined, { hotelId: hotelA });
    expect(assigned.status).toBe(200);
    expect((await call('GET', '/vendors/count', ownerA)).body.count).toBe(before + 1);
    expect((await call('PUT', `/vendors/${orphan.id}/hotel`, undefined, { hotelId: hotelB })).status).toBe(409);
    expect((await call('PUT', `/vendors/${orphan.id}/hotel`, undefined, { hotelId: 'nope' })).status).toBe(404);
    // hotel B only ever onboarded one vendor (VB, earlier test)
    expect((await call('GET', '/vendors/count', ownerB)).body.count).toBe(1);
  });

  it('service requests (no member header) behave as before', async () => {
    expect((await call('GET', '/payouts')).status).toBe(200);
  });
});
