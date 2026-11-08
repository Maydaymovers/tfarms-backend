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
    await prisma.idempotencyKey.deleteMany({ where: { scope: { in: [hotelA, hotelB] } } });
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

  it('vendor status: PENDING on signup, validated transitions, roles, audit, isolation', async () => {
    const v = (await call('POST', '/vendors/onboard', ownerA, { name: `S-${run}` })).body;
    expect(v.status).toBe('PENDING');
    // a forged status in the body is stripped, signup can never create ACTIVE
    const forged = (await call('POST', '/vendors/onboard', ownerA, { name: `F-${run}`, status: 'ACTIVE' })).body;
    expect(forged.status).toBe('PENDING');

    const patch = (id: string, member: string | undefined, status: string, reason?: string) =>
      call('PATCH', `/vendors/${id}/status`, member, { status, reason });

    // staff and other hotels cannot change it
    const staff = await patch(v.id, staffA, 'SETUP_REQUIRED');
    expect(staff.status).toBe(403);
    expect(staff.body.code).toBe('STATUS_CHANGE_NOT_AUTHORIZED');
    expect((await patch(v.id, ownerB, 'SETUP_REQUIRED')).status).toBe(404);

    // invalid transitions are rejected
    const skip = await patch(v.id, ownerA, 'ACTIVE');
    expect(skip.status).toBe(409);
    expect(skip.body.code).toBe('INVALID_STATUS_TRANSITION');
    expect((await patch(v.id, ownerA, 'NOPE')).status).toBe(400);

    // owner walks the happy path, platform admin (no member header) finishes it
    expect((await patch(v.id, ownerA, 'SETUP_REQUIRED', 'approved')).status).toBe(200);
    expect((await patch(v.id, ownerA, 'BANK_CONNECTED')).status).toBe(200);
    expect((await patch(v.id, undefined, 'VERIFICATION_PENDING')).status).toBe(200);
    expect((await patch(v.id, undefined, 'ACTIVE', 'verified by support')).status).toBe(200);
    expect((await call('GET', `/vendors/${v.id}`, ownerA)).body.status).toBe('ACTIVE');
    expect((await call('GET', `/vendors/${v.id}`, ownerB)).status).toBe(404);

    const history = (await call('GET', `/vendors/${v.id}/status-history`, ownerA)).body;
    expect(history.map((e: { newStatus: string }) => e.newStatus)).toEqual([
      'SETUP_REQUIRED', 'BANK_CONNECTED', 'VERIFICATION_PENDING', 'ACTIVE',
    ]);
    expect(history[0]).toMatchObject({ oldStatus: 'PENDING', changedBy: expect.stringMatching(/^member:/), reason: 'approved' });
    expect(history[3].changedBy).toBe('platform_admin');
    expect((await call('GET', `/vendors/${v.id}/status-history`, ownerB)).status).toBe(404);
  });

  it('Idempotency-Key makes onboarding safe to repeat', async () => {
    const send = (name: string, key: string) =>
      fetch(base + '/vendors/onboard', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'x-wix-member-id': ownerA, 'idempotency-key': key },
        body: JSON.stringify({ name }),
      }).then(async (r) => ({ status: r.status, body: await r.json() }));
    const key = `k-${run}`;
    const [a, b] = await Promise.all([send(`I-${run}`, key), send(`I-${run}`, key)]);
    expect(a.body.id).toBe(b.body.id);
    expect((await send(`I-${run}`, key)).body.id).toBe(a.body.id);
    expect(await prisma.vendor.count({ where: { name: `I-${run}` } })).toBe(1);
    expect((await send(`other-${run}`, key)).status).toBe(422);
    // the same key in another hotel is independent
    const other = await fetch(base + '/vendors/onboard', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'x-wix-member-id': ownerB, 'idempotency-key': key },
      body: JSON.stringify({ name: `I-${run}` }),
    });
    expect(other.status).toBe(201);
  });

  it('lists unassigned vendors for platform admin and moves them on assignment', async () => {
    const orphan = await prisma.vendor.create({ data: { name: `queue-${run}` } });
    const queue = (await call('GET', '/vendors/unassigned')).body as { vendorId: string; status: string; hotelId: null }[];
    const item = queue.find((v) => v.vendorId === orphan.id);
    expect(item).toMatchObject({ status: 'PENDING', hotelId: null });
    // hotel members never see the queue
    expect((await call('GET', '/vendors/unassigned', ownerA)).status).toBe(403);
    expect((await call('GET', '/vendors', ownerA)).body.map((v: { id: string }) => v.id)).not.toContain(orphan.id);

    await call('PUT', `/vendors/${orphan.id}/hotel`, undefined, { hotelId: hotelA });
    const after = (await call('GET', '/vendors/unassigned')).body as { vendorId: string }[];
    expect(after.map((v) => v.vendorId)).not.toContain(orphan.id);
    expect((await call('GET', '/vendors', ownerA)).body.map((v: { id: string }) => v.id)).toContain(orphan.id);
  });

  it('service requests (no member header) behave as before', async () => {
    expect((await call('GET', '/payouts')).status).toBe(200);
  });
});
