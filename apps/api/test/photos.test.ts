import { formatPoleCode } from '@smart-light/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, bearerFor, createTenant, createUser, prisma, uniqueSuffix } from './helpers';

/** Smallest valid-looking JPEG and PNG headers; content after the magic bytes is not decoded. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(100, 2),
]);

async function setup() {
  const tenant = await createTenant();
  const agency = await prisma.agency.create({
    data: { tenantId: tenant.id, name: `Dept ${uniqueSuffix()}`, type: 'MUNICIPAL' },
  });
  const technician = await createUser({
    role: 'TECHNICIAN',
    tenantId: tenant.id,
    agencyId: agency.id,
  });
  const otherTechnician = await createUser({
    role: 'TECHNICIAN',
    tenantId: tenant.id,
    agencyId: agency.id,
  });
  const supervisor = await createUser({ role: 'SUPERVISOR', tenantId: tenant.id });
  const pole = await prisma.pole.create({
    data: {
      tenantId: tenant.id,
      serial: 1,
      code: formatPoleCode(tenant.code, 1),
      latitude: 22.7,
      longitude: 75.8,
    },
  });
  const workOrder = await prisma.workOrder.create({
    data: {
      tenantId: tenant.id,
      number: `P-${uniqueSuffix()}`,
      poleId: pole.id,
      source: 'MANUAL',
      status: 'IN_PROGRESS',
      assignedTechnicianId: technician.id,
      slaDueAt: new Date(Date.now() + 86_400_000),
    },
  });
  return {
    workOrder,
    tech: await bearerFor(technician.email),
    other: await bearerFor(otherTechnician.email),
    sup: await bearerFor(supervisor.email),
  };
}

describe('repair photos', () => {
  it('stores private photos and serves them only through signed links', async () => {
    const city = await setup();
    const base = `/api/v1/work-orders/${city.workOrder.id}/photos`;

    const uploaded = await request(app)
      .post(`${base}?kind=BEFORE&latitude=22.7&longitude=75.8`)
      .set(city.tech)
      .set('Content-Type', 'image/jpeg')
      .send(JPEG);
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data).toMatchObject({ kind: 'BEFORE', latitude: 22.7 });

    // Declared as an image but is not one.
    const fake = await request(app)
      .post(`${base}?kind=AFTER`)
      .set(city.tech)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from('<html>not an image</html>'));
    expect(fake.status).toBe(415);
    // Only the assigned technician adds photos.
    const notMine = await request(app)
      .post(`${base}?kind=AFTER`)
      .set(city.other)
      .set('Content-Type', 'image/png')
      .send(PNG);
    expect(notMine.status).toBe(404);

    const list = await request(app).get(base).set(city.sup);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    const url = list.body.data[0].url as string;
    expect(url).toMatch(/^\/v1\/photos\/[0-9a-f-]+\?exp=\d+&sig=/);

    const image = await request(app).get(`/api${url}`);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/jpeg');
    expect(image.headers['cache-control']).toContain('private');
    expect(Buffer.compare(image.body as Buffer, JPEG)).toBe(0);

    const tampered = url.replace(/sig=./, 'sig=A');
    expect((await request(app).get(`/api${tampered}`)).status).toBe(403);
    const expired = url.replace(/exp=\d+/, 'exp=1000');
    expect((await request(app).get(`/api${expired}`)).status).toBe(403);
    expect(
      (await request(app).get(`/api/v1/photos/${list.body.data[0].id as string}`)).status,
    ).toBe(403);
  });

  it('refuses photos on jobs that are not being worked on', async () => {
    const city = await setup();
    await prisma.workOrder.update({
      where: { id: city.workOrder.id },
      data: { status: 'RESOLVED' },
    });
    const response = await request(app)
      .post(`/api/v1/work-orders/${city.workOrder.id}/photos?kind=AFTER`)
      .set(city.tech)
      .set('Content-Type', 'image/png')
      .send(PNG);
    expect(response.status).toBe(409);
  });
});
