import { parsePoleCode } from '@smart-light/shared';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  app,
  bearerFor,
  createTenant,
  createUser,
  TEST_PASSWORD,
  prisma,
  uniqueSuffix,
} from './helpers';

type Auth = { Authorization: string };

async function setupCity() {
  const tenant = await createTenant();
  const admin = await createUser({ role: 'MUNICIPAL_ADMIN', tenantId: tenant.id });
  const municipal = await prisma.agency.create({
    data: { tenantId: tenant.id, name: `Dept ${uniqueSuffix()}`, type: 'MUNICIPAL' },
  });
  const contractor = await prisma.agency.create({
    data: { tenantId: tenant.id, name: `Contractor ${uniqueSuffix()}`, type: 'CONTRACTOR' },
  });
  const zone = await prisma.zone.create({
    data: { tenantId: tenant.id, code: 'Z01', name: 'Zone One' },
  });
  return { tenant, admin, municipal, contractor, zone, auth: await bearerFor(admin.email) };
}

async function createPole(auth: Auth, body: Record<string, unknown> = {}) {
  const response = await request(app)
    .post('/api/v1/poles')
    .set(auth)
    .send({ latitude: 22.72, longitude: 75.86, ...body });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; code: string };
}

describe('municipalities (SUPER_ADMIN)', () => {
  let superAuth: Auth;

  beforeAll(async () => {
    superAuth = await bearerFor((await createUser({ role: 'SUPER_ADMIN' })).email);
  });

  it('onboards a municipality and lists it with stats', async () => {
    const slug = `city-${uniqueSuffix()}`;
    const created = await request(app)
      .post('/api/v1/tenants')
      .set(superAuth)
      .send({ slug, code: 'QZX', name: 'Quartz City', nameHi: 'क्वार्ट्ज़ नगर' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ slug, status: 'ONBOARDING', slaHours: 24 });

    const list = await request(app).get('/api/v1/tenants').set(superAuth);
    const listed = list.body.data.find((tenant: { slug: string }) => tenant.slug === slug);
    expect(listed?.stats).toEqual({
      poles: 0,
      devices: 0,
      devicesOnline: 0,
      users: 0,
      lights: {},
      openWorkOrders: 0,
    });
  });

  it('forbids municipal admins from platform endpoints', async () => {
    const { auth } = await setupCity();
    expect((await request(app).get('/api/v1/tenants').set(auth)).status).toBe(403);
  });

  it('hides suspended municipalities from the public portal', async () => {
    const active = await createTenant();
    const suspended = await createTenant({ status: 'SUSPENDED' });
    const ok = await request(app).get(`/api/v1/public/tenants/${active.slug}`);
    expect(ok.body.data).toEqual({
      slug: active.slug,
      code: active.code,
      name: active.name,
      nameHi: active.nameHi,
    });
    expect((await request(app).get(`/api/v1/public/tenants/${suspended.slug}`)).status).toBe(404);
  });
});

describe('users and agencies', () => {
  it('lets a municipal admin create a technician in an agency', async () => {
    const city = await setupCity();
    const response = await request(app)
      .post('/api/v1/users')
      .set(city.auth)
      .send({
        name: 'Ravi Technician',
        email: `ravi-${uniqueSuffix()}@test.local`,
        role: 'TECHNICIAN',
        agencyId: city.municipal.id,
        password: 'Strong-Pass-123',
      });
    expect(response.status).toBe(201);
    expect(response.body.data.agency.id).toBe(city.municipal.id);

    const agencies = await request(app).get('/api/v1/agencies').set(city.auth);
    const dept = agencies.body.data.find(
      (agency: { id: string }) => agency.id === city.municipal.id,
    );
    expect(dept.technicianCount).toBe(1);
  });

  it('lets a manager reset a password: unlocks and signs the user out', async () => {
    const city = await setupCity();
    const technician = await createUser({
      role: 'TECHNICIAN',
      tenantId: city.tenant.id,
      agencyId: city.municipal.id,
    });
    const oldAuth = await bearerFor(technician.email);
    await prisma.user.update({
      where: { id: technician.id },
      data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() + 60_000) },
    });

    const reset = await request(app)
      .post(`/api/v1/users/${technician.id}/password-reset`)
      .set(city.auth)
      .send({ password: 'Fresh-Pass-2026' });
    expect(reset.status).toBe(204);

    expect((await request(app).get('/api/v1/auth/me').set(oldAuth)).status).toBe(401);
    const login = (password: string) =>
      request(app)
        .post('/api/v1/auth/login')
        .send({ email: technician.email, password, client: 'mobile' });
    expect((await login('Fresh-Pass-2026')).status).toBe(200);
    expect((await login(TEST_PASSWORD)).status).toBe(401);

    const weak = await request(app)
      .post(`/api/v1/users/${technician.id}/password-reset`)
      .set(city.auth)
      .send({ password: 'short' });
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');

    // An agency manager cannot reset the municipal admin's password.
    const manager = await createUser({
      role: 'AGENCY_MANAGER',
      tenantId: city.tenant.id,
      agencyId: city.contractor.id,
    });
    const forbidden = await request(app)
      .post(`/api/v1/users/${city.admin.id}/password-reset`)
      .set(await bearerFor(manager.email))
      .send({ password: 'Fresh-Pass-2026' });
    expect(forbidden.status).toBe(403);

    // Another city cannot even see the user.
    const other = await setupCity();
    const hidden = await request(app)
      .post(`/api/v1/users/${technician.id}/password-reset`)
      .set(other.auth)
      .send({ password: 'Fresh-Pass-2026' });
    expect(hidden.status).toBe(404);
  });

  it('enforces agency rules and password strength', async () => {
    const city = await setupCity();
    const base = { name: 'Someone', role: 'TECHNICIAN', password: 'Strong-Pass-123' };
    const noAgency = await request(app)
      .post('/api/v1/users')
      .set(city.auth)
      .send({ ...base, email: `a-${uniqueSuffix()}@test.local` });
    expect(noAgency.body.error.code).toBe('AGENCY_REQUIRED');

    const weak = await request(app)
      .post('/api/v1/users')
      .set(city.auth)
      .send({
        ...base,
        agencyId: city.municipal.id,
        password: 'short',
        email: `b-${uniqueSuffix()}@test.local`,
      });
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('limits agency managers to technicians of their own agency', async () => {
    const city = await setupCity();
    const manager = await createUser({
      role: 'AGENCY_MANAGER',
      tenantId: city.tenant.id,
      agencyId: city.contractor.id,
    });
    const managerAuth = await bearerFor(manager.email);
    const payload = { name: 'Field Tech', password: 'Strong-Pass-123' };

    const own = await request(app)
      .post('/api/v1/users')
      .set(managerAuth)
      .send({
        ...payload,
        email: `t-${uniqueSuffix()}@test.local`,
        role: 'TECHNICIAN',
        agencyId: city.contractor.id,
      });
    expect(own.status).toBe(201);

    const otherAgency = await request(app)
      .post('/api/v1/users')
      .set(managerAuth)
      .send({
        ...payload,
        email: `u-${uniqueSuffix()}@test.local`,
        role: 'TECHNICIAN',
        agencyId: city.municipal.id,
      });
    expect(otherAgency.status).toBe(403);

    const supervisor = await request(app)
      .post('/api/v1/users')
      .set(managerAuth)
      .send({ ...payload, email: `v-${uniqueSuffix()}@test.local`, role: 'SUPERVISOR' });
    expect(supervisor.status).toBe(403);

    const list = await request(app).get('/api/v1/users').set(managerAuth);
    expect(
      list.body.data.every(
        (user: { agency: { id: string } | null }) => user.agency?.id === city.contractor.id,
      ),
    ).toBe(true);
  });

  it('signs a disabled user out immediately and blocks self-disable', async () => {
    const city = await setupCity();
    const operator = await createUser({ role: 'OPERATOR', tenantId: city.tenant.id });
    const operatorAuth = await bearerFor(operator.email);
    expect((await request(app).get('/api/v1/auth/me').set(operatorAuth)).status).toBe(200);

    const disable = await request(app)
      .patch(`/api/v1/users/${operator.id}`)
      .set(city.auth)
      .send({ status: 'DISABLED' });
    expect(disable.status).toBe(200);
    expect((await request(app).get('/api/v1/auth/me').set(operatorAuth)).status).toBe(401);

    const self = await request(app)
      .patch(`/api/v1/users/${city.admin.id}`)
      .set(city.auth)
      .send({ status: 'DISABLED' });
    expect(self.status).toBe(403);
  });
});

describe('tenant isolation', () => {
  it('never exposes another municipality’s data', async () => {
    const cityA = await setupCity();
    const cityB = await setupCity();
    const poleB = await createPole(cityB.auth);
    const userB = await createUser({ role: 'OPERATOR', tenantId: cityB.tenant.id });

    const listA = await request(app).get('/api/v1/poles').set(cityA.auth);
    expect(listA.body.data.some((pole: { id: string }) => pole.id === poleB.id)).toBe(false);

    expect((await request(app).get(`/api/v1/poles/${poleB.id}`).set(cityA.auth)).status).toBe(404);
    expect(
      (await request(app).get(`/api/v1/poles/by-code/${poleB.code}`).set(cityA.auth)).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/v1/poles?tenantId=${cityB.tenant.id}`).set(cityA.auth)).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(`/api/v1/users/${userB.id}`)
          .set(cityA.auth)
          .send({ name: 'Valid Name' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post('/api/v1/poles')
          .set(cityA.auth)
          .send({ latitude: 22.7, longitude: 75.8, zoneId: cityB.zone.id })
      ).body.error.code,
    ).toBe('INVALID_ZONE');
  });
});

describe('poles', () => {
  it('generates sequential, check-digit-protected pole codes', async () => {
    const city = await setupCity();
    const first = await createPole(city.auth, { zoneId: city.zone.id });
    const second = await createPole(city.auth);

    const a = parsePoleCode(first.code);
    const b = parsePoleCode(second.code);
    expect(a?.tenantCode).toBe(city.tenant.code);
    expect(b?.serial).toBe((a?.serial ?? 0) + 1);

    // Lenient technician / citizen input finds the same pole.
    const lookup = await request(app)
      .get(`/api/v1/poles/by-code/${first.code.replace(/-/g, '').toLowerCase()}`)
      .set(city.auth);
    expect(lookup.body.data.id).toBe(first.id);

    const typo = first.code.slice(0, -1) + ((Number(first.code.slice(-1)) + 1) % 10);
    const bad = await request(app).get(`/api/v1/poles/by-code/${typo}`).set(city.auth);
    expect(bad.body.error.code).toBe('INVALID_POLE_CODE');
  });

  it('bulk-imports poles with consecutive codes and zone codes', async () => {
    const city = await setupCity();
    const before = await createPole(city.auth);
    const response = await request(app)
      .post('/api/v1/poles/import')
      .set(city.auth)
      .send({
        rows: [
          { latitude: 22.7101, longitude: 75.8501, zoneCode: 'Z01', ward: 'Ward 12' },
          { latitude: 22.7102, longitude: 75.8502, wattage: 90 },
          { latitude: 22.7103, longitude: 75.8503, zoneCode: 'Z01' },
        ],
      });
    expect(response.status).toBe(201);
    expect(response.body.data.created).toBe(3);
    const serials = response.body.data.poles.map(
      (pole: { code: string }) => parsePoleCode(pole.code)?.serial,
    );
    const start = (parsePoleCode(before.code)?.serial ?? 0) + 1;
    expect(serials).toEqual([start, start + 1, start + 2]);

    const zoned = await prisma.pole.count({
      where: { tenantId: city.tenant.id, zoneId: city.zone.id },
    });
    expect(zoned).toBe(2);
    // The next single pole continues after the imported range.
    const after = await createPole(city.auth, { latitude: 22.73, longitude: 75.87 });
    expect(parsePoleCode(after.code)?.serial).toBe(start + 3);
  });

  it('saves nothing when any imported row is invalid, and blocks re-imports', async () => {
    const city = await setupCity();
    const rows = [
      { latitude: 22.7201, longitude: 75.8601 },
      { latitude: 22.7202, longitude: 75.8602, zoneCode: 'NOPE' },
      { latitude: 22.7201, longitude: 75.8601 },
    ];
    const bad = await request(app).post('/api/v1/poles/import').set(city.auth).send({ rows });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('IMPORT_INVALID');
    const fields = bad.body.error.details.map((detail: { field: string }) => detail.field);
    expect(fields).toEqual(expect.arrayContaining(['rows.1.zoneCode', 'rows.2.latitude']));
    expect(await prisma.pole.count({ where: { tenantId: city.tenant.id } })).toBe(0);

    const good = [rows[0]];
    expect(
      (await request(app).post('/api/v1/poles/import').set(city.auth).send({ rows: good })).status,
    ).toBe(201);
    const again = await request(app)
      .post('/api/v1/poles/import')
      .set(city.auth)
      .send({ rows: good });
    expect(again.body.error.code).toBe('IMPORT_INVALID');

    const outsideIndia = await request(app)
      .post('/api/v1/poles/import')
      .set(city.auth)
      .send({ rows: [{ latitude: 75.86, longitude: 22.72 }] });
    expect(outsideIndia.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('validates without saving on a dry run', async () => {
    const city = await setupCity();
    const rows = [{ latitude: 22.7301, longitude: 75.8701, zoneCode: 'Z01' }];
    const dry = await request(app)
      .post('/api/v1/poles/import?dryRun=true')
      .set(city.auth)
      .send({ rows });
    expect(dry.status).toBe(200);
    expect(dry.body.data).toEqual({ created: 0, poles: [] });
    expect(await prisma.pole.count({ where: { tenantId: city.tenant.id } })).toBe(0);

    const badDry = await request(app)
      .post('/api/v1/poles/import?dryRun=true')
      .set(city.auth)
      .send({ rows: [{ ...rows[0], zoneCode: 'NOPE' }] });
    expect(badDry.body.error.code).toBe('IMPORT_INVALID');
  });

  it('only lets asset editors import poles', async () => {
    const city = await setupCity();
    const technician = await createUser({
      role: 'TECHNICIAN',
      tenantId: city.tenant.id,
      agencyId: city.municipal.id,
    });
    const response = await request(app)
      .post('/api/v1/poles/import')
      .set(await bearerFor(technician.email))
      .send({ rows: [{ latitude: 22.74, longitude: 75.88 }] });
    expect(response.status).toBe(403);
  });

  it('serves map items inside a bounding box', async () => {
    const city = await setupCity();
    const inside = await createPole(city.auth, { latitude: 22.7, longitude: 75.85 });
    const outside = await createPole(city.auth, { latitude: 28.6, longitude: 77.2 });
    const response = await request(app)
      .get('/api/v1/poles/map?minLat=22&maxLat=23&minLng=75&maxLng=76')
      .set(city.auth);
    const ids = response.body.data.map((item: { id: string }) => item.id);
    expect(ids).toContain(inside.id);
    expect(ids).not.toContain(outside.id);
  });
});

describe('device commissioning and dashboard', () => {
  it('lets a technician install a controller by scanning codes', async () => {
    const city = await setupCity();
    const pole = await createPole(city.auth, { zoneId: city.zone.id });
    const technician = await createUser({
      role: 'TECHNICIAN',
      tenantId: city.tenant.id,
      agencyId: city.municipal.id,
    });
    const deviceId = `sl-${uniqueSuffix()}`;

    const response = await request(app)
      .post('/api/v1/devices/commission')
      .set(await bearerFor(technician.email))
      .send({ poleCode: pole.code, deviceId, firmwareVersion: '0.1.0' });
    expect(response.status).toBe(200);
    expect(response.body.data.device.deviceId).toBe(deviceId);

    const other = await setupCity();
    const otherPole = await createPole(other.auth);
    const stolen = await request(app)
      .post('/api/v1/devices/commission')
      .set(other.auth)
      .send({ poleCode: otherPole.code, deviceId });
    expect(stolen.body.error.code).toBe('DEVICE_OTHER_TENANT');
  });

  it('summarises light status per zone', async () => {
    const city = await setupCity();
    const pole = await createPole(city.auth, { zoneId: city.zone.id });
    await createPole(city.auth, { zoneId: city.zone.id });
    await prisma.pole.update({ where: { id: pole.id }, data: { lightStatus: 'FAULT' } });

    const response = await request(app).get('/api/v1/dashboard/summary').set(city.auth);
    expect(response.body.data.poles).toEqual({
      total: 2,
      working: 0,
      fault: 1,
      offline: 0,
      unknown: 1,
    });
    expect(response.body.data.zones[0]).toMatchObject({ code: 'Z01', total: 2, fault: 1 });
  });
});
