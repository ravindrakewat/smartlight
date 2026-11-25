import { formatPoleCode } from '@smart-light/shared';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app, bearerFor, createTenant, createUser, prisma, uniqueSuffix } from './helpers';

const SITE = { latitude: 22.7196, longitude: 75.8577, accuracyM: 10 };

async function setupCity() {
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
  const pole = await prisma.pole.create({
    data: {
      tenantId: tenant.id,
      serial: 1,
      code: formatPoleCode(tenant.code, 1),
      latitude: SITE.latitude,
      longitude: SITE.longitude,
      lightStatus: 'FAULT',
    },
  });
  return {
    tenant,
    pole,
    technician,
    admin: await bearerFor(admin.email),
    tech: await bearerFor(technician.email),
  };
}

describe('spare parts inventory', () => {
  let city: Awaited<ReturnType<typeof setupCity>>;
  let other: Awaited<ReturnType<typeof setupCity>>;
  beforeAll(async () => {
    city = await setupCity();
    other = await setupCity();
  });

  it('adds parts with opening stock, receives and corrects stock, keeps a ledger', async () => {
    const created = await request(app)
      .post('/api/v1/spare-parts')
      .set(city.admin)
      .send({ code: 'led-90w', name: 'LED lamp 90 W', minStock: 5, openingStock: 8 });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      code: 'LED-90W',
      stockQty: 8,
      lowStock: false,
      usedLast30Days: 0,
    });
    const id = created.body.data.id as string;

    const duplicate = await request(app)
      .post('/api/v1/spare-parts')
      .set(city.admin)
      .send({ code: 'LED-90W', name: 'Again' });
    expect(duplicate.body.error.code).toBe('SPARE_PART_EXISTS');

    const received = await request(app)
      .post(`/api/v1/spare-parts/${id}/stock`)
      .set(city.admin)
      .send({ kind: 'RECEIVED', quantity: 10, note: 'Store issue 14' });
    expect(received.body.data.stockQty).toBe(18);

    const noReason = await request(app)
      .post(`/api/v1/spare-parts/${id}/stock`)
      .set(city.admin)
      .send({ kind: 'ADJUSTED', quantity: -3 });
    expect(noReason.status).toBe(400);
    const corrected = await request(app)
      .post(`/api/v1/spare-parts/${id}/stock`)
      .set(city.admin)
      .send({ kind: 'ADJUSTED', quantity: -14, note: 'Physical count' });
    expect(corrected.body.data).toMatchObject({ stockQty: 4, lowStock: true });

    const ledger = await request(app).get(`/api/v1/spare-parts/${id}/movements`).set(city.admin);
    expect(ledger.body.data.map((row: { kind: string; quantity: number }) => row.quantity)).toEqual(
      [-14, 10, 8],
    );
    expect(await prisma.auditLog.count({ where: { entityType: 'spare_part', entityId: id } })).toBe(
      3,
    );
  });

  it('lets technicians read but not change stock, and keeps cities apart', async () => {
    const list = await request(app).get('/api/v1/spare-parts').set(city.tech);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    const id = list.body.data[0].id as string;
    expect(
      (
        await request(app)
          .post(`/api/v1/spare-parts/${id}/stock`)
          .set(city.tech)
          .send({ kind: 'RECEIVED', quantity: 1 })
      ).status,
    ).toBe(403);
    expect((await request(app).get('/api/v1/spare-parts').set(other.admin)).body.data).toEqual([]);
    expect(
      (await request(app).patch(`/api/v1/spare-parts/${id}`).set(other.admin).send({ minStock: 1 }))
        .status,
    ).toBe(404);
  });

  it('records checklist and parts used on completion and reduces stock', async () => {
    const part = await request(app)
      .post('/api/v1/spare-parts')
      .set(city.admin)
      .send({ code: `FUSE-${uniqueSuffix()}`.slice(0, 20), name: 'Fuse 6 A', openingStock: 3 });
    const fuseId = part.body.data.id as string;
    const foreign = await prisma.sparePart.create({
      data: { tenantId: other.tenant.id, code: `X-${uniqueSuffix()}`.slice(0, 20), name: 'Other' },
    });
    const workOrder = await prisma.workOrder.create({
      data: {
        tenantId: city.tenant.id,
        number: `INV-${uniqueSuffix()}`,
        poleId: city.pole.id,
        source: 'MANUAL',
        status: 'ASSIGNED',
        assignedTechnicianId: city.technician.id,
        slaDueAt: new Date(Date.now() + 86_400_000),
      },
    });
    await request(app)
      .post(`/api/v1/work-orders/${workOrder.id}/start`)
      .set(city.tech)
      .send(SITE)
      .expect(200);

    const wrongCity = await request(app)
      .post(`/api/v1/work-orders/${workOrder.id}/complete`)
      .set(city.tech)
      .send({
        ...SITE,
        resolutionCode: 'FUSE_REPLACED',
        parts: [{ sparePartId: foreign.id, quantity: 1 }],
      });
    expect(wrongCity.body.error.code).toBe('UNKNOWN_SPARE_PART');
    expect((await prisma.sparePart.findUniqueOrThrow({ where: { id: fuseId } })).stockQty).toBe(3);

    const done = await request(app)
      .post(`/api/v1/work-orders/${workOrder.id}/complete`)
      .set(city.tech)
      .send({
        ...SITE,
        resolutionCode: 'FUSE_REPLACED',
        checklist: ['POWER_ISOLATED', 'LIGHT_TESTED', 'LIGHT_TESTED'],
        parts: [{ sparePartId: fuseId, quantity: 2 }],
      });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({
      status: 'PENDING_VERIFICATION',
      checklist: ['POWER_ISOLATED', 'LIGHT_TESTED'],
      parts: [{ sparePartId: fuseId, quantity: 2, name: 'Fuse 6 A' }],
    });
    const after = await request(app).get('/api/v1/spare-parts').set(city.admin);
    expect(after.body.data.find((row: { id: string }) => row.id === fuseId)).toMatchObject({
      stockQty: 1,
      usedLast30Days: 2,
    });
    const ledger = await request(app)
      .get(`/api/v1/spare-parts/${fuseId}/movements`)
      .set(city.admin);
    expect(ledger.body.data[0]).toMatchObject({
      kind: 'USED',
      quantity: -2,
      workOrderNumber: workOrder.number,
    });
  });
});
