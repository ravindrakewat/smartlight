/**
 * ChirpStack bridge against a real MQTT broker (in-process Aedes). A test client
 * plays ChirpStack: it publishes v4 JSON events and receives the downlinks.
 * Simulator only: no network server, gateway or radio is involved.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import {
  base64ToBytes,
  bytesToBase64,
  CommandAckStatus,
  decodeLorawanCommand,
  encodeLorawanCommandAck,
  encodeLorawanTelemetry,
  LightOperatingMode,
} from '@smart-light/shared';
import { Aedes } from 'aedes';
import mqtt from 'mqtt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startChirpstackBridge } from '../src/iot/chirpstack-bridge';
import { createTenant, prisma, uniqueSuffix } from './helpers';

const APPLICATION_ID = '7d1c1b2e-3f4a-4b5c-8d6e-9f0a1b2c3d4e';

async function waitFor(check: () => Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out');
}

describe('ChirpStack bridge (real broker, simulated network server)', () => {
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

  it('ingests uplinks and delivers a confirmed downlink that the controller then applies', async () => {
    const tenant = await createTenant();
    const serial = Math.floor(Math.random() * 900_000) + 1;
    const pole = await prisma.pole.create({
      data: {
        tenantId: tenant.id,
        code: `${tenant.code}-${String(serial).padStart(6, '0')}-0`,
        serial,
        latitude: 22.7,
        longitude: 75.8,
      },
    });
    const device = await prisma.device.create({
      data: {
        tenantId: tenant.id,
        poleId: pole.id,
        deviceId: `sl-cs-${uniqueSuffix()}`,
        isSimulated: true,
      },
    });
    const devEui = randomUUID().replace(/-/g, '').slice(0, 16);
    await prisma.deviceInterface.create({
      data: {
        deviceId: device.id,
        kind: 'LORAWAN',
        identifier: devEui,
        lorawan: {
          create: { devEui, joinEui: '0'.repeat(16), deviceProfile: 'sim', isSimulated: true },
        },
      },
    });
    const events = `application/${APPLICATION_ID}/device/${devEui}/event`;

    const bridge = startChirpstackBridge({
      url: `mqtt://127.0.0.1:${port}`,
      clientId: `test-cs-bridge-${uniqueSuffix()}`,
      outboxIntervalMs: 60_000,
    });
    const chirpstack = await mqtt.connectAsync(`mqtt://127.0.0.1:${port}`, {
      clientId: `fake-chirpstack-${uniqueSuffix()}`,
    });
    const up = (fCnt: number, fPort: number, bytes: Uint8Array) =>
      JSON.stringify({
        deduplicationId: randomUUID(),
        time: new Date().toISOString(),
        deviceInfo: { applicationId: APPLICATION_ID, devEui },
        fCnt,
        fPort,
        data: bytesToBase64(bytes),
        rxInfo: [{ gatewayId: 'aa555a0000000101', rssi: -102, snr: 2.5 }],
      });
    try {
      await new Promise<void>((resolve) => {
        if (bridge.client.connected) resolve();
        else bridge.client.once('connect', () => resolve());
      });
      await new Promise((resolve) => setTimeout(resolve, 200));

      const frame = encodeLorawanTelemetry({
        lampOn: false,
        dimPercent: 0,
        mode: LightOperatingMode.Auto,
        motionDetected: false,
        voltageV: 229,
        currentA: 0,
        powerW: 0,
        energyWh: 10,
        ts: Math.floor(Date.now() / 1000),
        uptimeSec: 60,
      });
      await chirpstack.publishAsync(`${events}/up`, up(1, 10, frame), { qos: 1 });
      await waitFor(async () => {
        await bridge.idle();
        return (await prisma.deviceReading.count({ where: { deviceId: device.id } })) === 1;
      });
      expect((await prisma.pole.findUniqueOrThrow({ where: { id: pole.id } })).lightStatus).toBe(
        'OFF',
      );

      // A queued command for this radio.
      const issuedAt = Math.floor(Date.now() / 1000);
      const command = await prisma.deviceCommand.create({
        data: {
          tenantId: tenant.id,
          deviceId: device.id,
          action: 'set_output',
          channel: 'lorawan',
          payload: {
            v: 1,
            cmdId: randomUUID(),
            issuedAt,
            expiresAt: issuedAt + 900,
            action: 'set_output',
            on: true,
            dimPercent: 100,
            overrideUntil: issuedAt + 1_800,
          },
          expiresAt: new Date((issuedAt + 900) * 1000),
        },
      });
      const downlink = new Promise<Record<string, unknown>>((resolve) => {
        chirpstack.on('message', (_topic, message) => resolve(JSON.parse(message.toString())));
      });
      await chirpstack.subscribeAsync(
        `application/${APPLICATION_ID}/device/${devEui}/command/down`,
        { qos: 1 },
      );
      expect(await bridge.flushOutbox()).toBe(1);
      const message = await downlink;
      expect(message).toMatchObject({ id: command.id, devEui, confirmed: true, fPort: 40 });
      expect(decodeLorawanCommand(base64ToBytes(String(message['data'])))).toMatchObject({
        action: 'set_output',
        on: true,
        dimPercent: 100,
      });
      expect(
        (await prisma.deviceCommand.findUniqueOrThrow({ where: { id: command.id } })).status,
      ).toBe('SENT');

      // The controller answers on port 30.
      const ack = encodeLorawanCommandAck({ cmdId: command.id, status: CommandAckStatus.Accepted });
      await chirpstack.publishAsync(`${events}/up`, up(2, 30, ack), { qos: 1 });
      await waitFor(async () => {
        await bridge.idle();
        const row = await prisma.deviceCommand.findUniqueOrThrow({ where: { id: command.id } });
        return row.status === 'ACCEPTED' && row.appliedAt !== null;
      });
    } finally {
      await chirpstack.endAsync();
      await bridge.stop();
    }
  });
});
