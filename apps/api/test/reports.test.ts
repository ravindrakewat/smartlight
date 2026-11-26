import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { formatPoleCode } from '@smart-light/shared';
import { app, bearerFor, createTenant, createUser, prisma, uniqueSuffix } from './helpers';

async function setupCity() {
  const tenant = await createTenant();
  const admin = await createUser({ role: 'MUNICIPAL_ADMIN', tenantId: tenant.id });
  const pole = await prisma.pole.create({
    data: {
      tenantId: tenant.id,
      serial: 1,
      code: formatPoleCode(tenant.code, 1),
      latitude: 22.7,
      longitude: 75.8,
      address: '=HYPERLINK("http://evil")',
      lightStatus: 'ON',
    },
  });
  const device = await prisma.device.create({
    data: { tenantId: tenant.id, poleId: pole.id, deviceId: `sl-${uniqueSuffix()}`, online: true },
  });
  return { tenant, admin, pole, device, auth: await bearerFor(admin.email) };
}

const hours = (n: number) => n * 60 * 60 * 1000;

describe('reports', () => {
  it('summarises SLA compliance, repair time, energy and availability', async () => {
    const city = await setupCity();
    const now = Date.now();
    const base = {
      tenantId: city.tenant.id,
      poleId: city.pole.id,
      source: 'IOT_ALERT' as const,
      status: 'RESOLVED' as const,
    };
    // Repaired in 4 h (within the 24 h SLA) and in 30 h (late).
    await prisma.workOrder.create({
      data: {
        ...base,
        number: `R-${uniqueSuffix()}`,
        createdAt: new Date(now - hours(10)),
        slaDueAt: new Date(now + hours(14)),
        completedAt: new Date(now - hours(6)),
        verifiedAt: new Date(now - hours(5)),
      },
    });
    await prisma.workOrder.create({
      data: {
        ...base,
        number: `R-${uniqueSuffix()}`,
        source: 'CITIZEN_COMPLAINT',
        createdAt: new Date(now - hours(40)),
        slaDueAt: new Date(now - hours(16)),
        completedAt: new Date(now - hours(10)),
        verifiedAt: new Date(now - hours(9)),
      },
    });
    await prisma.deviceReading.createMany({
      data: [1000, 1250, 1500].map((energyWh) => ({
        deviceId: city.device.id,
        tenantId: city.tenant.id,
        deviceTs: 0,
        lampOn: true,
        dimPercent: 100,
        mode: 'auto',
        voltageV: 230,
        currentA: 0.4,
        powerW: 90,
        energyWh,
        rssiDbm: -70,
      })),
    });

    const response = await request(app).get('/api/v1/reports/summary?days=7').set(city.auth);
    expect(response.status).toBe(200);
    const report = response.body.data;
    expect(report.workOrders).toMatchObject({
      created: 2,
      resolved: 2,
      resolvedWithinSla: 1,
      slaCompliance: 0.5,
      averageRepairHours: 17,
      bySource: { IOT_ALERT: 1, CITIZEN_COMPLAINT: 1, INSPECTION: 0, MANUAL: 0 },
    });
    expect(report.energy).toEqual({ kWh: 0.5, controllersReporting: 1 });
    expect(report.poles).toMatchObject({
      total: 1,
      workingNow: 1,
      controllersOnline: 1,
      controllers: 1,
    });

    expect((await request(app).get('/api/v1/reports/summary?days=12').set(city.auth)).status).toBe(
      400,
    );
  });

  it('exports work orders as Excel-safe CSV', async () => {
    const city = await setupCity();
    await prisma.workOrder.create({
      data: {
        tenantId: city.tenant.id,
        poleId: city.pole.id,
        number: `CSV-${uniqueSuffix()}`,
        source: 'MANUAL',
        slaDueAt: new Date(Date.now() + hours(24)),
      },
    });
    const response = await request(app)
      .get('/api/v1/reports/work-orders.csv?days=30')
      .set(city.auth);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');
    const lines = response.text.slice(response.text.charCodeAt(0) === 0xfeff ? 1 : 0).split('\r\n');
    expect(lines[0]).toContain('"number","pole"');
    expect(lines).toHaveLength(2);
    // A formula in the address must not be executable in a spreadsheet.
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  it('breaks the period down by day, fault, ward, technician and agency', async () => {
    const city = await setupCity();
    const ward = await prisma.ward.create({
      data: { tenantId: city.tenant.id, code: `W${uniqueSuffix()}`.slice(0, 10), name: 'Ward 36' },
    });
    await prisma.pole.update({ where: { id: city.pole.id }, data: { wardId: ward.id } });
    const legacyPole = await prisma.pole.create({
      data: {
        tenantId: city.tenant.id,
        serial: 2,
        code: formatPoleCode(city.tenant.code, 2),
        latitude: 22.7,
        longitude: 75.8,
        ward: 'Old ward 5',
        lightStatus: 'FAULT',
      },
    });
    const agency = await prisma.agency.create({
      data: { tenantId: city.tenant.id, name: `Contractor ${uniqueSuffix()}`, type: 'CONTRACTOR' },
    });
    const technician = await createUser({
      role: 'TECHNICIAN',
      tenantId: city.tenant.id,
      agencyId: agency.id,
    });
    const now = Date.now();
    const job = {
      tenantId: city.tenant.id,
      source: 'IOT_ALERT' as const,
      assignedAgencyId: agency.id,
      assignedTechnicianId: technician.id,
    };
    await prisma.workOrder.create({
      data: {
        ...job,
        poleId: city.pole.id,
        number: `B-${uniqueSuffix()}`,
        faultType: 'LAMP_FAILURE',
        status: 'RESOLVED',
        createdAt: new Date(now - hours(10)),
        slaDueAt: new Date(now + hours(14)),
        completedAt: new Date(now - hours(6)),
        verifiedAt: new Date(now - hours(5)),
      },
    });
    await prisma.workOrder.create({
      data: {
        ...job,
        poleId: legacyPole.id,
        number: `B-${uniqueSuffix()}`,
        faultType: 'LAMP_FAILURE',
        status: 'ASSIGNED',
        slaDueAt: new Date(now - hours(1)),
      },
    });
    await prisma.device.update({ where: { id: city.device.id }, data: { isSimulated: true } });
    await prisma.deviceReading.createMany({
      data: [1000, 1400].map((energyWh) => ({
        deviceId: city.device.id,
        tenantId: city.tenant.id,
        deviceTs: 0,
        lampOn: true,
        dimPercent: 100,
        mode: 'auto',
        voltageV: 230,
        currentA: 0.4,
        powerW: 90,
        energyWh,
        rssiDbm: -70,
      })),
    });

    const response = await request(app).get('/api/v1/reports/breakdown?days=7').set(city.auth);
    expect(response.status).toBe(200);
    const report = response.body.data;
    expect(report.bucket).toBe('day');
    expect(report.trend.length).toBeGreaterThanOrEqual(7);
    const totals = report.trend.reduce(
      (sum: { created: number; resolved: number; kwh: number }, point: Record<string, number>) => ({
        created: sum.created + (point.workOrdersCreated ?? 0),
        resolved: sum.resolved + (point.workOrdersResolved ?? 0),
        kwh: sum.kwh + (point.energyKWh ?? 0),
      }),
      { created: 0, resolved: 0, kwh: 0 },
    );
    expect(totals).toEqual({ created: 2, resolved: 1, kwh: 0.4 });
    expect(report.faults).toEqual([{ faultType: 'LAMP_FAILURE', count: 2 }]);
    expect(report.wards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          wardId: ward.id,
          name: 'Ward 36',
          poles: 1,
          working: 1,
          resolved: 1,
          resolvedWithinSla: 1,
          averageRepairHours: 4,
        }),
        expect.objectContaining({
          wardId: null,
          name: 'Old ward 5',
          poles: 1,
          faulty: 1,
          open: 1,
          overdue: 1,
        }),
      ]),
    );
    expect(report.technicians).toEqual([
      expect.objectContaining({
        id: technician.id,
        agency: agency.name,
        open: 1,
        overdue: 1,
        resolved: 1,
        resolvedWithinSla: 1,
      }),
    ]);
    expect(report.agencies).toEqual([
      expect.objectContaining({ id: agency.id, open: 1, resolved: 1 }),
    ]);
    expect(report.dataSources).toEqual({
      controllersReporting: 1,
      simulatedControllersReporting: 1,
    });

    const year = await request(app).get('/api/v1/reports/breakdown?days=365').set(city.auth);
    expect(year.body.data.bucket).toBe('month');
    expect(year.body.data.trend.length).toBeGreaterThanOrEqual(12);
  });

  it('is limited to management roles and to the own city', async () => {
    const city = await setupCity();
    const technician = await createUser({ role: 'TECHNICIAN', tenantId: city.tenant.id });
    const forbidden = await request(app)
      .get('/api/v1/reports/summary')
      .set(await bearerFor(technician.email));
    expect(forbidden.status).toBe(403);
    const forbiddenBreakdown = await request(app)
      .get('/api/v1/reports/breakdown')
      .set(await bearerFor(technician.email));
    expect(forbiddenBreakdown.status).toBe(403);

    const other = await createTenant();
    const crossCity = await request(app)
      .get(`/api/v1/reports/summary?tenantId=${other.id}`)
      .set(city.auth);
    expect(crossCity.status).toBe(403);
  });
});

describe('audit and controller lists', () => {
  it('shows a municipal admin only their own audit trail', async () => {
    const city = await setupCity();
    const other = await setupCity();
    await request(app)
      .post('/api/v1/lighting/commands')
      .set(city.auth)
      .send({ target: { type: 'pole', poleId: city.pole.id }, control: { action: 'auto' } });
    await request(app)
      .post('/api/v1/lighting/commands')
      .set(other.auth)
      .send({ target: { type: 'pole', poleId: other.pole.id }, control: { action: 'auto' } });

    const response = await request(app).get('/api/v1/audit?action=lighting.').set(city.auth);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      action: 'lighting.control',
      actorType: 'USER',
      actor: city.admin.name,
      tenant: { id: city.tenant.id },
    });

    const superAdmin = await createUser({ role: 'SUPER_ADMIN' });
    const all = await request(app)
      .get(`/api/v1/audit?action=lighting.&tenantId=${other.tenant.id}`)
      .set(await bearerFor(superAdmin.email));
    expect(all.body.data.map((entry: { tenant: { id: string } }) => entry.tenant.id)).toEqual([
      other.tenant.id,
    ]);
  });

  it('pages the command history of a pole, newest first, within the own city', async () => {
    const city = await setupCity();
    const controls = [
      { action: 'auto' },
      { action: 'off', durationMinutes: 30 },
      { action: 'on', dimPercent: 50, durationMinutes: 30 },
    ];
    for (const control of controls) {
      const sent = await request(app)
        .post('/api/v1/lighting/commands')
        .set(city.auth)
        .send({ target: { type: 'pole', poleId: city.pole.id }, control });
      expect(sent.status).toBe(202);
    }
    const first = await request(app)
      .get(`/api/v1/poles/${city.pole.id}/commands?page=1&pageSize=2`)
      .set(city.auth);
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta.pagination).toMatchObject({ page: 1, totalItems: 3, totalPages: 2 });
    const second = await request(app)
      .get(`/api/v1/poles/${city.pole.id}/commands?page=2&pageSize=2`)
      .set(city.auth);
    expect(second.body.data).toHaveLength(1);
    const ids = [...first.body.data, ...second.body.data].map((row: { id: string }) => row.id);
    expect(new Set(ids).size).toBe(3);
    expect(first.body.data[0].createdBy).toMatchObject({ name: city.admin.name });

    const other = await setupCity();
    expect(
      (await request(app).get(`/api/v1/poles/${city.pole.id}/commands`).set(other.auth)).status,
    ).toBe(404);
  });

  it('lists controllers of the own city, searchable by pole code', async () => {
    const city = await setupCity();
    const response = await request(app)
      .get(`/api/v1/devices?search=${city.pole.code}`)
      .set(city.auth);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      deviceId: city.device.deviceId,
      pole: { code: city.pole.code },
      online: true,
    });
  });
});
