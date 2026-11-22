import { createServer, type Server } from 'node:net';
import { Aedes } from 'aedes';
import mqtt from 'mqtt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatPoleCode, validDeviceCommandSchema } from '@smart-light/shared';
import { startMqttBridge } from '../src/iot/mqtt-bridge';
import { ingestService } from '../src/modules/iot/ingest.service';
import { app, bearerFor, createTenant, createUser, prisma, uniqueSuffix } from './helpers';

type Auth = { Authorization: string };

let serial = 0;
async function setupCity() {
  const tenant = await createTenant();
  const admin = await createUser({ role: 'MUNICIPAL_ADMIN', tenantId: tenant.id });
  const agency = await prisma.agency.create({
    data: { tenantId: tenant.id, name: `Dept ${uniqueSuffix()}`, type: 'MUNICIPAL' },
  });
  const zone = await prisma.zone.create({
    data: { tenantId: tenant.id, code: 'Z01', name: 'Zone One' },
  });

  async function makePole(withDevice = true) {
    serial++;
    const pole = await prisma.pole.create({
      data: {
        tenantId: tenant.id,
        zoneId: zone.id,
        serial,
        code: formatPoleCode(tenant.code, serial),
        latitude: 22.7 + serial / 10_000,
        longitude: 75.85,
      },
    });
    const device = withDevice
      ? await prisma.device.create({
          data: { tenantId: tenant.id, poleId: pole.id, deviceId: `sl-${uniqueSuffix()}` },
        })
      : null;
    return { pole, device };
  }

  return { tenant, admin, agency, zone, makePole, auth: await bearerFor(admin.email) };
}

const telemetry = (overrides: { on?: boolean; currentA?: number; dim?: number } = {}) => ({
  v: 1,
  ts: 1_763_836_200,
  seq: 1,
  lamp: { on: overrides.on ?? true, dimPercent: overrides.dim ?? 100, mode: 'auto' },
  electrical: {
    voltageV: 231,
    currentA: overrides.currentA ?? 0.42,
    powerW: 92,
    energyWh: 1500,
  },
  environment: { motionDetected: false },
  device: { firmwareVersion: '1.0.0', uptimeSec: 60, network: 'cellular', rssiDbm: -75 },
});

const lampFailure = (seq: number) => ({
  v: 1,
  ts: 1_763_836_300 + seq,
  seq,
  type: 'lamp_failure',
  severity: 'critical',
  snapshot: { voltageV: 230, currentA: 0, lampOn: true },
});

describe('IoT ingestion', () => {
  let city: Awaited<ReturnType<typeof setupCity>>;
  beforeAll(async () => {
    city = await setupCity();
  });

  it('stores telemetry and updates the controller and pole', async () => {
    const { pole, device } = await city.makePole();
    const outcome = await ingestService.handle(
      city.tenant.slug,
      device!.deviceId,
      'telemetry' as never,
      telemetry({ dim: 60 }),
    );
    expect(outcome).toBe('stored');
    const updated = await prisma.device.findUniqueOrThrow({ where: { id: device!.id } });
    expect(updated).toMatchObject({ online: true, lampOn: true, dimPercent: 60, mode: 'auto' });
    expect((await prisma.pole.findUniqueOrThrow({ where: { id: pole.id } })).lightStatus).toBe(
      'DIMMED',
    );
    expect(await prisma.deviceReading.count({ where: { deviceId: device!.id } })).toBe(1);
  });

  it('drops messages from unknown controllers or the wrong city', async () => {
    const { device } = await city.makePole();
    const other = await createTenant();
    expect(
      await ingestService.handle(other.slug, device!.deviceId, 'telemetry' as never, telemetry()),
    ).toBe('unknown_device');
    expect(
      await ingestService.handle(city.tenant.slug, 'sl-nobody', 'telemetry' as never, telemetry()),
    ).toBe('unknown_device');
    expect(
      await ingestService.handle(city.tenant.slug, device!.deviceId, 'telemetry' as never, {
        v: 2,
      }),
    ).toBe('invalid_payload');
  });

  it('opens one work order for a lamp failure, ignoring redelivery', async () => {
    const { pole, device } = await city.makePole();
    const send = (payload: unknown) =>
      ingestService.handle(city.tenant.slug, device!.deviceId, 'event' as never, payload);

    expect(await send(lampFailure(1))).toBe('stored');
    expect(await send(lampFailure(1))).toBe('duplicate');
    expect(await send({ ...lampFailure(2), type: 'relay_stuck' })).toBe('stored');

    const orders = await prisma.workOrder.findMany({ where: { poleId: pole.id } });
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      source: 'IOT_ALERT',
      priority: 'HIGH',
      faultType: 'lamp_failure',
    });
    expect((await prisma.pole.findUniqueOrThrow({ where: { id: pole.id } })).lightStatus).toBe(
      'FAULT',
    );
    const events = await prisma.deviceEvent.findMany({ where: { deviceId: device!.id } });
    expect(events.every((event) => event.workOrderId === orders[0]!.id)).toBe(true);
  });

  it('closes a repaired job from telemetry, or sends it back when still dark', async () => {
    const { pole, device } = await city.makePole();
    await ingestService.handle(
      city.tenant.slug,
      device!.deviceId,
      'event' as never,
      lampFailure(5),
    );
    const order = await prisma.workOrder.findFirstOrThrow({ where: { poleId: pole.id } });
    const pending = () =>
      prisma.workOrder.update({
        where: { id: order.id },
        data: { status: 'PENDING_VERIFICATION', completedAt: new Date() },
      });

    await pending();
    await ingestService.handle(
      city.tenant.slug,
      device!.deviceId,
      'telemetry' as never,
      telemetry({ currentA: 0 }),
    );
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'ASSIGNED',
    );

    await pending();
    await ingestService.handle(
      city.tenant.slug,
      device!.deviceId,
      'telemetry' as never,
      telemetry({ currentA: 0.4 }),
    );
    const done = await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(done).toMatchObject({ status: 'RESOLVED', verificationMethod: 'IOT_TELEMETRY' });
  });

  it('marks a pole offline when its controller drops off', async () => {
    const { pole, device } = await city.makePole();
    await ingestService.handle(city.tenant.slug, device!.deviceId, 'status' as never, {
      v: 1,
      ts: 0,
      online: false,
    });
    expect((await prisma.pole.findUniqueOrThrow({ where: { id: pole.id } })).lightStatus).toBe(
      'OFFLINE',
    );
  });
});

describe('lighting control API', () => {
  let city: Awaited<ReturnType<typeof setupCity>>;
  beforeAll(async () => {
    city = await setupCity();
  });

  it('queues a valid override for one pole', async () => {
    const { pole, device } = await city.makePole();
    const response = await request(app)
      .post('/api/v1/lighting/commands')
      .set(city.auth)
      .send({
        target: { type: 'pole', poleId: pole.id },
        control: { action: 'on', dimPercent: 70, durationMinutes: 120 },
      });
    expect(response.status).toBe(202);
    expect(response.body.data).toEqual({ queued: 1, withoutController: 0 });

    const command = await prisma.deviceCommand.findFirstOrThrow({
      where: { deviceId: device!.id },
    });
    const payload = validDeviceCommandSchema.parse(command.payload);
    expect(payload).toMatchObject({ action: 'set_output', on: true, dimPercent: 70 });
    if (payload.action === 'set_output') {
      expect(payload.overrideUntil - payload.issuedAt).toBe(120 * 60);
    }
    expect(command.status).toBe('PENDING');
  });

  it('switches a whole zone and counts poles without a controller', async () => {
    const zoneCity = await setupCity();
    await zoneCity.makePole();
    await zoneCity.makePole();
    await zoneCity.makePole(false);
    const response = await request(app)
      .post('/api/v1/lighting/commands')
      .set(zoneCity.auth)
      .send({ target: { type: 'zone', zoneId: zoneCity.zone.id }, control: { action: 'auto' } });
    expect(response.body.data).toEqual({ queued: 2, withoutController: 1 });
  });

  it('lets a technician only briefly test a pole from their own job', async () => {
    const { pole } = await city.makePole();
    const technician = await createUser({
      role: 'TECHNICIAN',
      tenantId: city.tenant.id,
      agencyId: city.agency.id,
    });
    const auth = await bearerFor(technician.email);
    const test = (durationMinutes: number) =>
      request(app)
        .post('/api/v1/lighting/commands')
        .set(auth)
        .send({
          target: { type: 'pole', poleId: pole.id },
          control: { action: 'on', durationMinutes },
        });

    expect((await test(10)).status).toBe(403);
    await prisma.workOrder.create({
      data: {
        tenantId: city.tenant.id,
        number: `T-${uniqueSuffix()}`,
        poleId: pole.id,
        source: 'MANUAL',
        status: 'IN_PROGRESS',
        assignedTechnicianId: technician.id,
        slaDueAt: new Date(Date.now() + 86_400_000),
      },
    });
    expect((await test(10)).status).toBe(202);
    expect((await test(60)).status).toBe(403);
  });

  it("cannot reach another city's pole", async () => {
    const other = await setupCity();
    const { pole } = await other.makePole();
    const response = await request(app)
      .post('/api/v1/lighting/commands')
      .set(city.auth)
      .send({ target: { type: 'pole', poleId: pole.id }, control: { action: 'auto' } });
    expect(response.status).toBe(404);
  });
});

describe('schedules', () => {
  it('pushes the default schedule with the pole location and tracks the ack', async () => {
    const city = await setupCity();
    const { pole, device } = await city.makePole();
    const created = await request(app)
      .post('/api/v1/schedules')
      .set(city.auth)
      .send({
        name: 'Winter',
        isDefault: true,
        steps: [
          { anchor: 'sunset', offsetMinutes: 10, on: true, dimPercent: 100 },
          { anchor: 'clock', atMinute: 1380, on: true, dimPercent: 60 },
          { anchor: 'sunrise', offsetMinutes: -10, on: false, dimPercent: 0 },
        ],
      });
    expect(created.status).toBe(201);

    const command = await prisma.deviceCommand.findFirstOrThrow({
      where: { deviceId: device!.id, action: 'set_schedule' },
    });
    const payload = validDeviceCommandSchema.parse(command.payload);
    expect(payload.action === 'set_schedule' && payload.location).toEqual({
      latitude: pole.latitude,
      longitude: pole.longitude,
    });
    expect(payload.action === 'set_schedule' && payload.utcOffsetMinutes).toBe(330);

    let live = await request(app).get(`/api/v1/poles/${pole.id}/live`).set(city.auth);
    expect(live.body.data.device.scheduleInSync).toBe(false);

    await ingestService.handle(city.tenant.slug, device!.deviceId, 'cmd/ack' as never, {
      v: 1,
      ts: 0,
      cmdId: command.id,
      status: 'accepted',
    });
    live = await request(app).get(`/api/v1/poles/${pole.id}/live`).set(city.auth);
    expect(live.body.data.device.scheduleInSync).toBe(true);
    expect(live.body.data.schedule).toMatchObject({ name: 'Winter', fromZone: false });
    expect(live.body.data.commands[0]).toMatchObject({
      action: 'set_schedule',
      status: 'ACCEPTED',
    });
  });

  it('assigns a zone schedule, supersedes stale commands and protects the default', async () => {
    const city = await setupCity();
    const { device } = await city.makePole();
    const steps = [{ anchor: 'clock', atMinute: 1080, on: true, dimPercent: 100 }];
    const defaultSchedule = await request(app)
      .post('/api/v1/schedules')
      .set(city.auth)
      .send({ name: 'Default', isDefault: true, steps });
    const festival = await request(app)
      .post('/api/v1/schedules')
      .set(city.auth)
      .send({ name: 'Festival', steps });

    const assigned = await request(app)
      .put(`/api/v1/zones/${city.zone.id}/schedule`)
      .set(city.auth)
      .send({ scheduleId: festival.body.data.id });
    expect(assigned.body.data.queued).toBe(1);

    const commands = await prisma.deviceCommand.findMany({
      where: { deviceId: device!.id, action: 'set_schedule' },
      orderBy: { createdAt: 'asc' },
    });
    expect(commands.map((command) => command.status)).toEqual(['EXPIRED', 'PENDING']);

    const remove = await request(app)
      .delete(`/api/v1/schedules/${defaultSchedule.body.data.id}`)
      .set(city.auth);
    expect(remove.body.error.code).toBe('DEFAULT_SCHEDULE');

    const tooFar = await request(app)
      .post('/api/v1/schedules')
      .set(city.auth)
      .send({
        name: 'Bad',
        steps: [{ anchor: 'sunset', offsetMinutes: 400, on: true, dimPercent: 100 }],
      });
    expect(tooFar.status).toBe(400);
  });
});

describe('alerts API', () => {
  it('lists open faults and lets an operator resolve one', async () => {
    const city = await setupCity();
    const { device } = await city.makePole();
    await ingestService.handle(city.tenant.slug, device!.deviceId, 'event' as never, {
      v: 1,
      ts: 1_763_836_999,
      seq: 9,
      type: 'under_voltage',
      severity: 'warning',
    });
    const list = await request(app).get('/api/v1/alerts').set(city.auth);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ type: 'under_voltage', severity: 'warning' });

    const resolved = await request(app)
      .post(`/api/v1/alerts/${list.body.data[0].id}/resolve`)
      .set(city.auth);
    expect(resolved.body.data.resolvedAt).not.toBeNull();
    expect((await request(app).get('/api/v1/alerts').set(city.auth)).body.data).toHaveLength(0);
  });
});

describe('MQTT bridge (real broker)', () => {
  let broker: Aedes;
  let server: Server;
  let port = 0;

  beforeAll(async () => {
    broker = await Aedes.createBroker();
    server = createServer(broker.handle as never);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : 0;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => broker.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('ingests controller messages and delivers acknowledged commands', async () => {
    const city = await setupCity();
    const { pole, device } = await city.makePole();
    const deviceId = device!.deviceId;
    const base = `sl/v1/${city.tenant.slug}/${deviceId}`;

    const bridge = startMqttBridge({
      url: `mqtt://127.0.0.1:${port}`,
      clientId: `test-bridge-${uniqueSuffix()}`,
      outboxIntervalMs: 60_000,
    });
    const controller = await mqtt.connectAsync(`mqtt://127.0.0.1:${port}`, {
      clientId: deviceId,
    });
    try {
      await new Promise<void>((resolve) => {
        if (bridge.client.connected) resolve();
        else bridge.client.once('connect', () => resolve());
      });
      // Give the bridge's subscription a moment to reach the broker.
      await new Promise((resolve) => setTimeout(resolve, 200));

      await controller.publishAsync(`${base}/telemetry`, JSON.stringify(telemetry()), { qos: 1 });
      await waitFor(async () => {
        await bridge.idle();
        return (await prisma.device.findUniqueOrThrow({ where: { id: device!.id } })).online;
      });

      const received = new Promise<{ cmdId: string; action: string }>((resolve) => {
        controller.on('message', (_topic, message) => resolve(JSON.parse(message.toString())));
      });
      await controller.subscribeAsync(`${base}/cmd`, { qos: 1 });
      await request(app)
        .post('/api/v1/lighting/commands')
        .set(city.auth as Auth)
        .send({
          target: { type: 'pole', poleId: pole.id },
          control: { action: 'off', durationMinutes: 30 },
        });
      expect(await bridge.flushOutbox()).toBe(1);

      const command = await received;
      expect(command.action).toBe('set_output');
      await controller.publishAsync(
        `${base}/cmd/ack`,
        JSON.stringify({ v: 1, ts: 0, cmdId: command.cmdId, status: 'accepted' }),
        { qos: 1 },
      );
      await waitFor(async () => {
        await bridge.idle();
        const stored = await prisma.deviceCommand.findUniqueOrThrow({
          where: { id: command.cmdId },
        });
        return stored.status === 'ACCEPTED';
      });
    } finally {
      await controller.endAsync();
      await bridge.stop();
    }
  });
});

async function waitFor(check: () => Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Condition not met in time');
}
