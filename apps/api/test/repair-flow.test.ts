import { formatPoleCode } from '@smart-light/shared';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { testOutbox } from '../src/lib/sms';
import { workOrdersService } from '../src/modules/work-orders/work-orders.service';
import { app, bearerFor, createTenant, createUser, prisma, uniqueSuffix } from './helpers';

const CITIZEN_ORIGIN = 'http://localhost:3000';
const POLE_LOCATION = { latitude: 22.7196, longitude: 75.8577 };

let phoneCounter = 0;
function newPhone(): string {
  phoneCounter++;
  return `+9198${String(Date.now()).slice(-6)}${String(phoneCounter).padStart(2, '0')}`;
}

/** Signs a citizen in through the real OTP flow and returns a cookie-carrying agent. */
async function citizenAgent(phone = newPhone()) {
  const agent = request.agent(app);
  const requested = await agent.post('/api/v1/public/otp/request').send({ phone });
  expect(requested.status).toBe(204);
  const sms = [...testOutbox].reverse().find((message) => message.phone === phone);
  const code = sms?.message.slice(0, 6) ?? '';
  const verified = await agent.post('/api/v1/public/otp/verify').send({ phone, code });
  expect(verified.status).toBe(200);
  return { agent, phone };
}

async function setupCity() {
  const tenant = await createTenant();
  const municipal = await prisma.agency.create({
    data: { tenantId: tenant.id, name: `Dept ${uniqueSuffix()}`, type: 'MUNICIPAL' },
  });
  const contractor = await prisma.agency.create({
    data: { tenantId: tenant.id, name: `Contractor ${uniqueSuffix()}`, type: 'CONTRACTOR' },
  });
  const supervisor = await createUser({ role: 'SUPERVISOR', tenantId: tenant.id });
  const technician = await createUser({
    role: 'TECHNICIAN',
    tenantId: tenant.id,
    agencyId: municipal.id,
  });
  const otherTechnician = await createUser({
    role: 'TECHNICIAN',
    tenantId: tenant.id,
    agencyId: contractor.id,
  });
  let serial = 0;
  const makePole = async (withController: boolean) => {
    serial++;
    return prisma.pole.create({
      data: {
        tenantId: tenant.id,
        serial,
        code: formatPoleCode(tenant.code, serial),
        ...POLE_LOCATION,
        lightStatus: 'FAULT',
        ...(withController
          ? {
              device: {
                create: { tenantId: tenant.id, deviceId: `sl-${uniqueSuffix()}`, online: true },
              },
            }
          : {}),
      },
    });
  };
  return {
    tenant,
    municipal,
    contractor,
    supervisor,
    technician,
    otherTechnician,
    makePole,
    supervisorAuth: await bearerFor(supervisor.email),
    technicianAuth: await bearerFor(technician.email),
    otherTechnicianAuth: await bearerFor(otherTechnician.email),
  };
}

describe('citizen OTP sign-in', () => {
  it('rejects a wrong code and limits code requests per phone', async () => {
    const phone = newPhone();
    const agent = request.agent(app);
    await agent.post('/api/v1/public/otp/request').send({ phone });
    const wrong = await agent.post('/api/v1/public/otp/verify').send({ phone, code: '000000' });
    // (Astronomically unlikely to be the real code.)
    expect(['INVALID_OTP']).toContain(wrong.body.error.code);

    await agent.post('/api/v1/public/otp/request').send({ phone });
    await agent.post('/api/v1/public/otp/request').send({ phone });
    const fourth = await agent.post('/api/v1/public/otp/request').send({ phone });
    expect(fourth.status).toBe(429);
  });

  it('requires a verified citizen to file a complaint', async () => {
    const response = await request(app)
      .post('/api/v1/public/complaints')
      .send({ poleCode: 'IND-000001-8', category: 'LIGHT_OFF' });
    expect(response.status).toBe(401);
  });
});

describe('complaint → work order → repair → verification', () => {
  let city: Awaited<ReturnType<typeof setupCity>>;

  beforeAll(async () => {
    city = await setupCity();
  });

  it('runs the full repair flow with IoT verification and citizen SMS', async () => {
    const pole = await city.makePole(true);
    const first = await citizenAgent();
    const second = await citizenAgent();

    // 1. Citizen files a complaint by scanning the pole.
    const filed = await first.agent
      .post('/api/v1/public/complaints')
      .set('Origin', CITIZEN_ORIGIN)
      .send({ poleCode: pole.code.replace(/-/g, ''), category: 'LIGHT_OFF', name: 'Asha' });
    expect(filed.status).toBe(201);
    expect(filed.body.data.joinedExistingRepair).toBe(false);
    const complaintNumber = filed.body.data.complaint.number as string;
    expect(complaintNumber).toMatch(new RegExp(`^${city.tenant.code}-C-\\d{6}$`));

    // SLA deadline ≈ 24 h.
    const slaHours = (Date.parse(filed.body.data.complaint.slaDueAt) - Date.now()) / 3_600_000;
    expect(slaHours).toBeGreaterThan(23.9);
    expect(slaHours).toBeLessThanOrEqual(24);

    // 2. A second citizen reports the same pole: joins the repair, no duplicate work order.
    const joined = await second.agent
      .post('/api/v1/public/complaints')
      .set('Origin', CITIZEN_ORIGIN)
      .send({ poleCode: pole.code, category: 'EXPOSED_WIRING' });
    expect(joined.body.data.joinedExistingRepair).toBe(true);
    expect(await prisma.workOrder.count({ where: { poleId: pole.id } })).toBe(1);

    const workOrder = await prisma.workOrder.findFirstOrThrow({ where: { poleId: pole.id } });
    expect(workOrder.priority).toBe('CRITICAL'); // upgraded by the wiring report

    // Public pole page shows the open repair.
    const publicPole = await request(app).get(`/api/v1/public/poles/${pole.code}`);
    expect(publicPole.body.data.openRepair.status).toBe('OPEN');

    // 3. Supervisor assigns the technician.
    const assigned = await request(app)
      .post(`/api/v1/work-orders/${workOrder.id}/assign`)
      .set(city.supervisorAuth)
      .send({ technicianId: city.technician.id });
    expect(assigned.body.data.status).toBe('ASSIGNED');
    expect(assigned.body.data.complaintCount).toBe(2);

    const tracked = await request(app).get(`/api/v1/public/complaints/${complaintNumber}`);
    expect(tracked.body.data.status).toBe('IN_PROGRESS');
    expect(tracked.body.data.timeline.map((step: { status: string }) => step.status)).toEqual([
      'SUBMITTED',
      'ASSIGNED',
    ]);

    // Other technicians cannot see or act on it.
    expect(
      (await request(app).get(`/api/v1/work-orders/${workOrder.id}`).set(city.otherTechnicianAuth))
        .status,
    ).toBe(404);

    // 4. Technician must be on site.
    const far = await request(app)
      .post(`/api/v1/work-orders/${workOrder.id}/start`)
      .set(city.technicianAuth)
      .send({ latitude: 22.75, longitude: 75.9, accuracyM: 10 });
    expect(far.body.error.code).toBe('TOO_FAR_FROM_POLE');

    const onSite = {
      latitude: POLE_LOCATION.latitude + 0.0002,
      longitude: POLE_LOCATION.longitude,
      accuracyM: 8,
    };
    const started = await request(app)
      .post(`/api/v1/work-orders/${workOrder.id}/start`)
      .set(city.technicianAuth)
      .send(onSite);
    expect(started.body.data.status).toBe('IN_PROGRESS');

    const completed = await request(app)
      .post(`/api/v1/work-orders/${workOrder.id}/complete`)
      .set(city.technicianAuth)
      .send({ ...onSite, resolutionCode: 'LAMP_REPLACED' });
    expect(completed.body.data.status).toBe('PENDING_VERIFICATION');

    // 5. The controller still sees no lamp current → back to the technician.
    await workOrdersService.verifyFromTelemetry(pole.id, false);
    const rejected = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
    expect(rejected.status).toBe('ASSIGNED');

    // 6. Second attempt; this time the controller confirms the lamp works.
    await request(app)
      .post(`/api/v1/work-orders/${workOrder.id}/start`)
      .set(city.technicianAuth)
      .send(onSite);
    await request(app)
      .post(`/api/v1/work-orders/${workOrder.id}/complete`)
      .set(city.technicianAuth)
      .send({ ...onSite, resolutionCode: 'DRIVER_REPLACED' });
    testOutbox.length = 0;
    await workOrdersService.verifyFromTelemetry(pole.id, true);

    const detail = await request(app)
      .get(`/api/v1/work-orders/${workOrder.id}`)
      .set(city.supervisorAuth);
    expect(detail.body.data.status).toBe('RESOLVED');
    expect(detail.body.data.verificationMethod).toBe('IOT_TELEMETRY');
    expect(detail.body.data.events.map((event: { type: string }) => event.type)).toEqual(
      expect.arrayContaining([
        'CREATED',
        'ASSIGNED',
        'STARTED',
        'COMPLETED',
        'VERIFICATION_FAILED',
        'VERIFIED',
      ]),
    );

    const final = await request(app).get(`/api/v1/public/complaints/${complaintNumber}`);
    expect(final.body.data.status).toBe('RESOLVED');
    expect((await prisma.pole.findUniqueOrThrow({ where: { id: pole.id } })).lightStatus).toBe(
      'ON',
    );

    // Both citizens were told by SMS.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const notified = testOutbox
      .filter((message) => message.message.includes('resolved'))
      .map((m) => m.phone);
    expect(notified).toEqual(expect.arrayContaining([first.phone, second.phone]));
  });

  it('lets a supervisor verify repairs on poles without a controller', async () => {
    const pole = await city.makePole(false);
    const created = await request(app)
      .post('/api/v1/work-orders')
      .set(city.supervisorAuth)
      .send({ poleCode: pole.code, faultType: 'LIGHT_OFF' });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    const duplicate = await request(app)
      .post('/api/v1/work-orders')
      .set(city.supervisorAuth)
      .send({ poleCode: pole.code });
    expect(duplicate.body.error.code).toBe('WORK_ORDER_EXISTS');

    await request(app)
      .post(`/api/v1/work-orders/${id}/assign`)
      .set(city.supervisorAuth)
      .send({ technicianId: city.technician.id });
    const site = { ...POLE_LOCATION, accuracyM: 5 };
    await request(app).post(`/api/v1/work-orders/${id}/start`).set(city.technicianAuth).send(site);
    await request(app)
      .post(`/api/v1/work-orders/${id}/complete`)
      .set(city.technicianAuth)
      .send({ ...site, resolutionCode: 'FUSE_REPLACED' });

    // A technician cannot approve their own work.
    expect(
      (
        await request(app)
          .post(`/api/v1/work-orders/${id}/verify`)
          .set(city.technicianAuth)
          .send({ approved: true })
      ).status,
    ).toBe(403);

    const verified = await request(app)
      .post(`/api/v1/work-orders/${id}/verify`)
      .set(city.supervisorAuth)
      .send({ approved: true, note: 'Checked photos' });
    expect(verified.body.data).toMatchObject({
      status: 'RESOLVED',
      verificationMethod: 'SUPERVISOR',
    });
  });

  it('keeps agency managers inside their own agency', async () => {
    const pole = await city.makePole(false);
    const manager = await createUser({
      role: 'AGENCY_MANAGER',
      tenantId: city.tenant.id,
      agencyId: city.contractor.id,
    });
    const created = await request(app)
      .post('/api/v1/work-orders')
      .set(city.supervisorAuth)
      .send({ poleCode: pole.code });
    const id = created.body.data.id as string;
    await request(app)
      .post(`/api/v1/work-orders/${id}/assign`)
      .set(city.supervisorAuth)
      .send({ agencyId: city.contractor.id });

    const managerAuth = await bearerFor(manager.email);
    const wrong = await request(app)
      .post(`/api/v1/work-orders/${id}/assign`)
      .set(managerAuth)
      .send({ technicianId: city.technician.id });
    expect(wrong.status).toBe(403);

    const right = await request(app)
      .post(`/api/v1/work-orders/${id}/assign`)
      .set(managerAuth)
      .send({ technicianId: city.otherTechnician.id });
    expect(right.body.data.technician.id).toBe(city.otherTechnician.id);
  });

  it('attaches location-only complaints to the nearest pole and masks phones for staff', async () => {
    const pole = await city.makePole(false);
    const citizen = await citizenAgent();
    const filed = await citizen.agent
      .post('/api/v1/public/complaints')
      .set('Origin', CITIZEN_ORIGIN)
      .send({
        tenantSlug: city.tenant.slug,
        latitude: POLE_LOCATION.latitude + 0.0001,
        longitude: POLE_LOCATION.longitude,
        category: 'FLICKERING',
      });
    expect(filed.status).toBe(201);
    expect(filed.body.data.complaint.poleCode).not.toBeNull();

    const staff = await request(app).get('/api/v1/complaints').set(city.supervisorAuth);
    const row = staff.body.data.find(
      (complaint: { number: string }) => complaint.number === filed.body.data.complaint.number,
    );
    expect(row.citizenPhoneMasked).toMatch(/^\+91 \d{2}XXXXXX\d{2}$/);
    expect(JSON.stringify(staff.body)).not.toContain(citizen.phone);
    void pole;
  });
});
