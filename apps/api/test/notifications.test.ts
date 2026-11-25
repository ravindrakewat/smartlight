import { formatPoleCode } from '@smart-light/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { escalateOverdueWorkOrders } from '../src/modules/work-orders/sla-escalation';
import { app, bearerFor, createTenant, createUser, prisma, uniqueSuffix } from './helpers';

const SITE = { latitude: 22.7196, longitude: 75.8577, accuracyM: 10 };

async function setupCity() {
  const tenant = await createTenant();
  const agency = await prisma.agency.create({
    data: { tenantId: tenant.id, name: `Dept ${uniqueSuffix()}`, type: 'MUNICIPAL' },
  });
  const supervisor = await createUser({ role: 'SUPERVISOR', tenantId: tenant.id });
  const technician = await createUser({
    role: 'TECHNICIAN',
    tenantId: tenant.id,
    agencyId: agency.id,
  });
  // No controller: the repair needs a supervisor's verification.
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
    supervisor,
    technician,
    sup: await bearerFor(supervisor.email),
    tech: await bearerFor(technician.email),
  };
}

const kinds = async (userId: string) =>
  (await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })).map(
    (row) => row.kind,
  );

describe('staff notifications', () => {
  it('tells the technician and supervisor about each step of a repair', async () => {
    const city = await setupCity();
    const workOrder = await prisma.workOrder.create({
      data: {
        tenantId: city.tenant.id,
        number: `N-${uniqueSuffix()}`,
        poleId: city.pole.id,
        source: 'MANUAL',
        slaDueAt: new Date(Date.now() + 86_400_000),
      },
    });
    const base = `/api/v1/work-orders/${workOrder.id}`;
    await request(app)
      .post(`${base}/assign`)
      .set(city.sup)
      .send({ technicianId: city.technician.id })
      .expect(200);
    await request(app).post(`${base}/start`).set(city.tech).send(SITE).expect(200);
    await request(app)
      .post(`${base}/complete`)
      .set(city.tech)
      .send({ ...SITE, resolutionCode: 'FUSE_REPLACED' })
      .expect(200);
    expect(await kinds(city.supervisor.id)).toEqual(['work_order.awaiting_verification']);

    await request(app)
      .post(`${base}/verify`)
      .set(city.sup)
      .send({ approved: false, note: 'Lamp still off' })
      .expect(200);
    await request(app).post(`${base}/start`).set(city.tech).send(SITE).expect(200);
    await request(app)
      .post(`${base}/complete`)
      .set(city.tech)
      .send({ ...SITE, resolutionCode: 'LAMP_REPLACED' })
      .expect(200);
    await request(app).post(`${base}/verify`).set(city.sup).send({ approved: true }).expect(200);

    expect(await kinds(city.technician.id)).toEqual([
      'work_order.assigned',
      'work_order.fix_rejected',
      'work_order.verified',
    ]);

    const list = await request(app).get('/api/v1/notifications').set(city.tech);
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({
      kind: 'work_order.verified',
      read: false,
      entityType: 'work_order',
      entityId: workOrder.id,
      data: { number: workOrder.number, poleCode: city.pole.code },
    });
    const count = await request(app).get('/api/v1/notifications/unread-count').set(city.tech);
    expect(count.body.data).toEqual({ unread: 3 });

    const one = await request(app)
      .post('/api/v1/notifications/read')
      .set(city.tech)
      .send({ ids: [list.body.data[0].id] });
    expect(one.body.data).toEqual({ unread: 2 });
    // Someone else's notification ids are ignored.
    const other = await request(app)
      .post('/api/v1/notifications/read')
      .set(city.sup)
      .send({ ids: [list.body.data[1].id] });
    // The supervisor's own count (two repairs awaiting verification); the technician's is unchanged.
    expect(other.body.data).toEqual({ unread: 2 });
    expect(
      (await request(app).get('/api/v1/notifications/unread-count').set(city.tech)).body.data,
    ).toEqual({ unread: 2 });
    const all = await request(app)
      .post('/api/v1/notifications/read')
      .set(city.tech)
      .send({ all: true });
    expect(all.body.data).toEqual({ unread: 0 });
    expect(
      (await request(app).get('/api/v1/notifications?unread=true').set(city.tech)).body.data,
    ).toEqual([]);
  });

  it('escalates an overdue job once, to the technician and supervisors', async () => {
    const city = await setupCity();
    const workOrder = await prisma.workOrder.create({
      data: {
        tenantId: city.tenant.id,
        number: `S-${uniqueSuffix()}`,
        poleId: city.pole.id,
        source: 'MANUAL',
        status: 'ASSIGNED',
        assignedTechnicianId: city.technician.id,
        slaDueAt: new Date(Date.now() - 60_000),
      },
    });
    await escalateOverdueWorkOrders();
    await escalateOverdueWorkOrders();
    expect(
      await prisma.workOrderEvent.count({
        where: { workOrderId: workOrder.id, type: 'SLA_BREACHED' },
      }),
    ).toBe(1);
    expect(await kinds(city.technician.id)).toEqual(['work_order.sla_breached']);
    expect(await kinds(city.supervisor.id)).toEqual(['work_order.sla_breached']);
  });

  it('stores push tokens for the signed-in user only', async () => {
    const city = await setupCity();
    const token = `ExponentPushToken[${uniqueSuffix()}]`;
    await request(app)
      .post('/api/v1/notifications/push-devices')
      .set(city.tech)
      .send({ token, platform: 'android' })
      .expect(204);
    await request(app)
      .post('/api/v1/notifications/push-devices')
      .set(city.sup)
      .send({ token, platform: 'android' })
      .expect(204);
    const stored = await prisma.pushDevice.findUniqueOrThrow({ where: { token } });
    expect(stored.userId).toBe(city.supervisor.id);
    expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
  });
});
