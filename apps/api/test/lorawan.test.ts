/**
 * LoRaWAN integration, simulator-based: ChirpStack v4 events are fed to the
 * service directly (no radio, no network server). Nothing here proves real
 * radio behaviour; see docs/iot/lorawan-architecture.md for the physical tests.
 */
import { randomUUID } from 'node:crypto';
import {
  base64ToBytes,
  bytesToBase64,
  CommandAckStatus,
  decodeLorawanCommand,
  DeviceEventSeverity,
  DeviceEventType,
  encodeLorawanCommandAck,
  encodeLorawanEvent,
  encodeLorawanTelemetry,
  LightOperatingMode,
} from '@smart-light/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { deviceSecretFingerprint, openDeviceSecret, sealDeviceSecret } from '../src/lib/secret-box';
import { chooseChannel } from '../src/modules/iot/commands.service';
import { lorawanService } from '../src/modules/lorawan/lorawan.service';
import { createTenant, prisma, uniqueSuffix } from './helpers';

const APPLICATION_ID = '7d1c1b2e-3f4a-4b5c-8d6e-9f0a1b2c3d4e';

function hex16(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

async function setup() {
  const tenant = await createTenant();
  const serial = Math.floor(Math.random() * 900_000) + 1;
  const pole = await prisma.pole.create({
    data: {
      tenantId: tenant.id,
      code: `${tenant.code}-${String(serial).padStart(6, '0')}-0`,
      serial,
      latitude: 22.72,
      longitude: 75.86,
    },
  });
  const device = await prisma.device.create({
    data: {
      tenantId: tenant.id,
      poleId: pole.id,
      deviceId: `sl-lw-${uniqueSuffix()}`,
      firmwareVersion: '1.1.0',
      isSimulated: true,
    },
  });
  const devEui = hex16();
  const gatewayEui = hex16();
  await prisma.deviceInterface.create({
    data: {
      deviceId: device.id,
      kind: 'LORAWAN',
      identifier: devEui,
      priority: 200,
      lorawan: {
        create: {
          devEui,
          joinEui: '0000000000000000',
          deviceProfile: 'street-light-in865',
          isSimulated: true,
        },
      },
    },
  });
  await prisma.gateway.create({
    data: { tenantId: tenant.id, gatewayEui, name: 'Simulated gateway', isSimulated: true },
  });
  return { tenant, pole, device, devEui, gatewayEui };
}

function uplink(
  devEui: string,
  gatewayEui: string,
  fCnt: number,
  fPort: number,
  bytes: Uint8Array,
  deduplicationId = randomUUID(),
) {
  return {
    deduplicationId,
    time: new Date().toISOString(),
    deviceInfo: { applicationId: APPLICATION_ID, devEui, deviceName: 'sim' },
    dr: 2,
    fCnt,
    fPort,
    data: bytesToBase64(bytes),
    rxInfo: [
      { gatewayId: gatewayEui, rssi: -97, snr: 4.5 },
      { gatewayId: hex16(), rssi: -110, snr: -3 },
    ],
    txInfo: { frequency: 865_062_500 },
  };
}

const telemetryFrame = encodeLorawanTelemetry({
  lampOn: true,
  dimPercent: 70,
  mode: LightOperatingMode.Auto,
  motionDetected: false,
  voltageV: 230.5,
  currentA: 0.31,
  powerW: 70.2,
  energyWh: 5_000,
  ts: Math.floor(Date.now() / 1000),
  uptimeSec: 3_600,
});

describe('LoRaWAN uplinks (simulator)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    ctx = await setup();
  });

  it('stores a telemetry uplink once, through the normal pipeline, labelled as simulated', async () => {
    const event = uplink(ctx.devEui, ctx.gatewayEui, 5, 10, telemetryFrame);
    expect(await lorawanService.handleEvent('up', ctx.devEui, event)).toBe('stored');
    expect(await lorawanService.handleEvent('up', ctx.devEui, event)).toBe('duplicate');

    const readings = await prisma.deviceReading.findMany({ where: { deviceId: ctx.device.id } });
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({ via: 'lorawan', snrDb: 4.5, rssiDbm: -97, dimPercent: 70 });

    const pole = await prisma.pole.findUniqueOrThrow({ where: { id: ctx.pole.id } });
    expect(pole.lightStatus).toBe('DIMMED');

    const stored = await prisma.lorawanUplink.findUniqueOrThrow({
      where: { deduplicationId: event.deduplicationId },
    });
    expect(stored).toMatchObject({
      result: 'ok',
      isSimulated: true,
      gatewayEui: ctx.gatewayEui,
      gatewayCount: 2,
      fCnt: 5,
    });

    const registry = await prisma.lorawanDevice.findUniqueOrThrow({
      where: { devEui: ctx.devEui },
    });
    expect(registry).toMatchObject({ lastFCntUp: 5, joinStatus: 'JOINED' });
    const gateway = await prisma.gateway.findUniqueOrThrow({
      where: { gatewayEui: ctx.gatewayEui },
    });
    expect(gateway.online).toBe(true);
  });

  it('rejects unknown devices, topic mismatches and malformed frames without side effects', async () => {
    const stranger = hex16();
    const unknown = uplink(stranger, ctx.gatewayEui, 1, 10, telemetryFrame);
    expect(await lorawanService.handleEvent('up', stranger, unknown)).toBe('unknown_device');
    expect(
      (
        await prisma.lorawanUplink.findUniqueOrThrow({
          where: { deduplicationId: unknown.deduplicationId },
        })
      ).result,
    ).toBe('unknown_device');

    const mismatch = uplink(ctx.devEui, ctx.gatewayEui, 6, 10, telemetryFrame);
    expect(await lorawanService.handleEvent('up', hex16(), mismatch)).toBe('topic_mismatch');

    const before = await prisma.deviceReading.count({ where: { deviceId: ctx.device.id } });
    const broken = uplink(ctx.devEui, ctx.gatewayEui, 7, 10, telemetryFrame.slice(0, 10));
    expect(await lorawanService.handleEvent('up', ctx.devEui, broken)).toBe('decode_error');
    expect(await prisma.deviceReading.count({ where: { deviceId: ctx.device.id } })).toBe(before);

    expect(await lorawanService.handleEvent('up', ctx.devEui, { nonsense: true })).toBe(
      'invalid_payload',
    );
  });

  it('turns a lamp-failure event into a fault and a repair work order', async () => {
    const frame = encodeLorawanEvent({
      type: DeviceEventType.LampFailure,
      severity: DeviceEventSeverity.Critical,
      ts: Math.floor(Date.now() / 1000),
    });
    const outcome = await lorawanService.handleEvent(
      'up',
      ctx.devEui,
      uplink(ctx.devEui, ctx.gatewayEui, 8, 20, frame),
    );
    expect(outcome).toBe('stored');
    const pole = await prisma.pole.findUniqueOrThrow({ where: { id: ctx.pole.id } });
    expect(pole.lightStatus).toBe('FAULT');
    expect(await prisma.workOrder.count({ where: { poleId: ctx.pole.id } })).toBe(1);
  });

  it('records a join and resets the frame counter', async () => {
    const outcome = await lorawanService.handleEvent('join', ctx.devEui, {
      deduplicationId: randomUUID(),
      time: new Date().toISOString(),
      deviceInfo: { applicationId: APPLICATION_ID, devEui: ctx.devEui },
    });
    expect(outcome).toBe('joined');
    const registry = await prisma.lorawanDevice.findUniqueOrThrow({
      where: { devEui: ctx.devEui },
    });
    expect(registry.joinStatus).toBe('JOINED');
    expect(registry.lastFCntUp).toBeNull();
    expect(
      await prisma.auditLog.count({ where: { action: 'lorawan.join', actorId: ctx.devEui } }),
    ).toBe(1);
  });
});

describe('LoRaWAN commands (simulator)', () => {
  it('goes queued → enqueued → transmitted → received → applied, each from its own evidence', async () => {
    const ctx = await setup();
    const issuedAt = Math.floor(Date.now() / 1000);
    const command = await prisma.deviceCommand.create({
      data: {
        tenantId: ctx.tenant.id,
        deviceId: ctx.device.id,
        action: 'set_output',
        channel: 'lorawan',
        payload: {
          v: 1,
          cmdId: randomUUID(),
          issuedAt,
          expiresAt: issuedAt + 900,
          action: 'set_output',
          on: true,
          dimPercent: 50,
          overrideUntil: issuedAt + 3_600,
        },
        expiresAt: new Date((issuedAt + 900) * 1000),
      },
    });

    const downlink = await lorawanService.buildDownlink(command.id);
    if ('error' in downlink) throw new Error(downlink.error);
    expect(downlink.topic).toBe(`application/${APPLICATION_ID}/device/${ctx.devEui}/command/down`);
    expect(downlink.message).toMatchObject({ id: command.id, confirmed: true, fPort: 40 });
    expect(decodeLorawanCommand(base64ToBytes(String(downlink.message['data'])))).toMatchObject({
      cmdId: command.id,
      action: 'set_output',
      on: true,
      dimPercent: 50,
    });

    // What the bridge does after ChirpStack accepted the enqueue.
    await prisma.deviceCommand.update({
      where: { id: command.id },
      data: { status: 'SENT', sentAt: new Date(), downlinkId: command.id },
    });
    const deviceInfo = { applicationId: APPLICATION_ID, devEui: ctx.devEui };
    expect(
      await lorawanService.handleEvent('txack', ctx.devEui, {
        deviceInfo,
        queueItemId: command.id,
        gatewayId: ctx.gatewayEui,
      }),
    ).toBe('command_updated');
    expect(
      await lorawanService.handleEvent('ack', ctx.devEui, {
        deviceInfo,
        queueItemId: command.id,
        acknowledged: true,
      }),
    ).toBe('command_updated');

    let row = await prisma.deviceCommand.findUniqueOrThrow({ where: { id: command.id } });
    expect(row.transmittedAt).not.toBeNull();
    expect(row.ackAt).not.toBeNull();
    // Received is not applied.
    expect(row).toMatchObject({ status: 'SENT', appliedAt: null });

    const ack = encodeLorawanCommandAck({ cmdId: command.id, status: CommandAckStatus.Accepted });
    expect(
      await lorawanService.handleEvent(
        'up',
        ctx.devEui,
        uplink(ctx.devEui, ctx.gatewayEui, 9, 30, ack),
      ),
    ).toBe('stored');
    row = await prisma.deviceCommand.findUniqueOrThrow({ where: { id: command.id } });
    expect(row.status).toBe('ACCEPTED');
    expect(row.appliedAt).not.toBeNull();
  });

  it('fails a downlink the device never confirmed, and refuses commands too big for LoRaWAN', async () => {
    const ctx = await setup();
    const issuedAt = Math.floor(Date.now() / 1000);
    const base = {
      tenantId: ctx.tenant.id,
      deviceId: ctx.device.id,
      channel: 'lorawan',
      expiresAt: new Date((issuedAt + 900) * 1000),
    };
    const unconfirmed = await prisma.deviceCommand.create({
      data: {
        ...base,
        action: 'set_auto',
        status: 'SENT',
        payload: {
          v: 1,
          cmdId: randomUUID(),
          issuedAt,
          expiresAt: issuedAt + 900,
          action: 'set_auto',
        },
      },
    });
    await prisma.deviceCommand.update({
      where: { id: unconfirmed.id },
      data: { downlinkId: unconfirmed.id },
    });
    await lorawanService.handleEvent('ack', ctx.devEui, {
      deviceInfo: { applicationId: APPLICATION_ID, devEui: ctx.devEui },
      queueItemId: unconfirmed.id,
      acknowledged: false,
    });
    expect(
      (await prisma.deviceCommand.findUniqueOrThrow({ where: { id: unconfirmed.id } })).status,
    ).toBe('FAILED');

    const schedule = await prisma.deviceCommand.create({
      data: {
        ...base,
        action: 'set_schedule',
        payload: {
          v: 1,
          cmdId: randomUUID(),
          issuedAt,
          expiresAt: issuedAt + 900,
          action: 'set_schedule',
        },
      },
    });
    expect(await lorawanService.buildDownlink(schedule.id)).toEqual({
      error: 'set_schedule cannot be sent over LoRaWAN',
    });
  });

  it('uses LoRaWAN only when it is the preferred link and the command fits', async () => {
    const ctx = await setup();
    expect(await chooseChannel(prisma, ctx.device.id, 'set_output')).toBe('lorawan');
    expect(await chooseChannel(prisma, ctx.device.id, 'set_schedule')).toBe('mqtt');

    await prisma.deviceInterface.create({
      data: {
        deviceId: ctx.device.id,
        kind: 'CELLULAR',
        identifier: `imei-${uniqueSuffix()}`,
        priority: 100,
      },
    });
    expect(await chooseChannel(prisma, ctx.device.id, 'set_output')).toBe('mqtt');

    const legacy = await prisma.device.create({
      data: { tenantId: ctx.tenant.id, deviceId: `sl-legacy-${uniqueSuffix()}` },
    });
    expect(await chooseChannel(prisma, legacy.id, 'set_output')).toBe('mqtt');
  });
});

describe('device secrets', () => {
  it('encrypts AppKeys with a fresh IV and fingerprints them consistently', () => {
    const appKey = '2b7e151628aed2a6abf7158809cf4f3c';
    const first = sealDeviceSecret(appKey);
    expect(first).toMatch(/^v1:/);
    expect(first).not.toContain(appKey);
    expect(sealDeviceSecret(appKey)).not.toBe(first);
    expect(openDeviceSecret(first)).toBe(appKey);
    expect(deviceSecretFingerprint(appKey.toUpperCase())).toBe(deviceSecretFingerprint(appKey));
  });
});
