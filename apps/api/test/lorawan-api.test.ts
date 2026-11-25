import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app, bearerFor, createTenant, createUser, prisma, uniqueSuffix } from './helpers';

const hex = (bytes: number) => randomBytes(bytes).toString('hex');

async function city() {
  const tenant = await createTenant();
  const agency = await prisma.agency.create({
    data: { tenantId: tenant.id, name: `Dept ${uniqueSuffix()}`, type: 'MUNICIPAL' },
  });
  const admin = await createUser({ role: 'MUNICIPAL_ADMIN', tenantId: tenant.id });
  const technician = await createUser({
    role: 'TECHNICIAN',
    tenantId: tenant.id,
    agencyId: agency.id,
  });
  const controller = await prisma.device.create({
    data: { tenantId: tenant.id, deviceId: `sl-api-${uniqueSuffix()}` },
  });
  return {
    tenant,
    controller,
    admin: await bearerFor(admin.email),
    technician: await bearerFor(technician.email),
  };
}

describe('LoRaWAN registry API', () => {
  let a: Awaited<ReturnType<typeof city>>;
  let b: Awaited<ReturnType<typeof city>>;
  beforeAll(async () => {
    a = await city();
    b = await city();
  });

  it('registers a radio and never returns the AppKey', async () => {
    const appKey = hex(16);
    const response = await request(app)
      .post('/api/v1/lorawan/devices')
      .set(a.admin)
      .send({
        deviceId: a.controller.id,
        devEui: hex(8).toUpperCase(),
        joinEui: hex(8),
        appKey,
        deviceProfile: 'street-light-in865',
        isSimulated: true,
      });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      appKeySet: true,
      region: 'IN865',
      activation: 'OTAA',
      joinStatus: 'NOT_JOINED',
      isSimulated: true,
    });
    expect(response.body.data.devEui).toMatch(/^[0-9a-f]{16}$/);
    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain(appKey);
    expect(raw).not.toMatch(/appKeyEncrypted|appKeyFingerprint/);

    const list = await request(app).get('/api/v1/lorawan/devices').set(a.admin);
    expect(list.body.data).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(appKey);

    const stored = await prisma.lorawanDevice.findFirstOrThrow({
      where: { devEui: response.body.data.devEui },
    });
    expect(stored.appKeyEncrypted).toMatch(/^v1:/);
    expect(stored.appKeyEncrypted).not.toContain(appKey);
    expect(
      await prisma.auditLog.count({
        where: { action: 'lorawan.device_registered', entityId: a.controller.id },
      }),
    ).toBe(1);
  });

  it('refuses a shared AppKey, a second LoRaWAN link and duplicate DevEUIs', async () => {
    const appKey = hex(16);
    const first = await prisma.device.create({
      data: { tenantId: a.tenant.id, deviceId: `sl-api-${uniqueSuffix()}` },
    });
    const second = await prisma.device.create({
      data: { tenantId: a.tenant.id, deviceId: `sl-api-${uniqueSuffix()}` },
    });
    const body = (deviceId: string, key: string, devEui = hex(8)) => ({
      deviceId,
      devEui,
      joinEui: hex(8),
      appKey: key,
      deviceProfile: 'street-light-in865',
    });
    const ok = await request(app)
      .post('/api/v1/lorawan/devices')
      .set(a.admin)
      .send(body(first.id, appKey));
    expect(ok.status).toBe(201);
    const shared = await request(app)
      .post('/api/v1/lorawan/devices')
      .set(a.admin)
      .send(body(second.id, appKey.toUpperCase()));
    expect(shared.status).toBe(409);
    expect(shared.body.error.code).toBe('APPKEY_REUSED');
    const twice = await request(app)
      .post('/api/v1/lorawan/devices')
      .set(a.admin)
      .send(body(first.id, hex(16)));
    expect(twice.body.error.code).toBe('LORAWAN_DEVICE_EXISTS');
    const weak = await request(app)
      .post('/api/v1/lorawan/devices')
      .set(a.admin)
      .send(body(second.id, '0'.repeat(32)));
    expect(weak.status).toBe(400);
  });

  it('keeps registration to admins of the same municipality', async () => {
    const body = {
      deviceId: b.controller.id,
      devEui: hex(8),
      joinEui: hex(8),
      appKey: hex(16),
      deviceProfile: 'street-light-in865',
    };
    expect(
      (await request(app).post('/api/v1/lorawan/devices').set(a.admin).send(body)).status,
    ).toBe(404);
    expect(
      (await request(app).post('/api/v1/lorawan/devices').set(b.technician).send(body)).status,
    ).toBe(403);
    expect((await request(app).get('/api/v1/lorawan/devices').set(b.technician)).status).toBe(403);
    // Municipality B sees none of A's radios.
    const listB = await request(app).get('/api/v1/lorawan/devices').set(b.admin);
    expect(listB.body.data).toHaveLength(0);
  });

  it('registers and lists gateways per municipality', async () => {
    const gatewayEui = hex(8);
    const created = await request(app)
      .post('/api/v1/gateways')
      .set(a.admin)
      .send({ gatewayEui, name: 'Simulated gateway Vijay Nagar', isSimulated: true });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      online: false,
      isSimulated: true,
      network: 'LORAWAN',
    });
    const again = await request(app)
      .post('/api/v1/gateways')
      .set(a.admin)
      .send({ gatewayEui, name: 'Duplicate' });
    expect(again.body.error.code).toBe('GATEWAY_EXISTS');
    expect((await request(app).get('/api/v1/gateways').set(a.admin)).body.data).toHaveLength(1);
    expect((await request(app).get('/api/v1/gateways').set(b.admin)).body.data).toHaveLength(0);
    expect(
      (
        await request(app)
          .post('/api/v1/gateways')
          .set(a.technician)
          .send({ gatewayEui: hex(8), name: 'x1' })
      ).status,
    ).toBe(403);
  });
});
