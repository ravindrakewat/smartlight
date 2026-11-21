import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDeviceTopic,
  commandAckPayloadSchema,
  deviceCommandSchema,
  deviceEventPayloadSchema,
  DeviceTopicChannel,
  parseDeviceTopic,
  telemetryPayloadSchema,
} from '../src';

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', 'iot', name), 'utf8'));
}

describe('MQTT topics', () => {
  it('builds and parses a round-trip topic', () => {
    const topic = buildDeviceTopic('indore-mc', 'sl-000123', DeviceTopicChannel.CommandAck);

    expect(topic).toBe('sl/v1/indore-mc/sl-000123/cmd/ack');
    expect(parseDeviceTopic(topic)).toEqual({
      tenantId: 'indore-mc',
      deviceId: 'sl-000123',
      channel: DeviceTopicChannel.CommandAck,
    });
  });

  it('rejects wildcards and unsafe identifiers', () => {
    expect(() => buildDeviceTopic('indore/#', 'sl-1', DeviceTopicChannel.Telemetry)).toThrow();
    expect(parseDeviceTopic('sl/v1/indore-mc/+/telemetry')).toBeNull();
    expect(parseDeviceTopic('sl/v2/indore-mc/sl-1/telemetry')).toBeNull();
    expect(parseDeviceTopic('sl/v1/indore-mc/sl-1/unknown')).toBeNull();
  });
});

describe('IoT payload fixtures', () => {
  it('accepts the reference telemetry payload', () => {
    expect(telemetryPayloadSchema.safeParse(loadFixture('telemetry.json')).success).toBe(true);
  });

  it('accepts the reference lamp-failure event', () => {
    expect(deviceEventPayloadSchema.safeParse(loadFixture('event-lamp-failure.json')).success).toBe(
      true,
    );
  });

  it('accepts the reference schedule command and ack', () => {
    expect(deviceCommandSchema.safeParse(loadFixture('command-set-schedule.json')).success).toBe(
      true,
    );
    expect(commandAckPayloadSchema.safeParse(loadFixture('command-ack.json')).success).toBe(true);
  });
});

describe('IoT payload validation', () => {
  it('rejects telemetry with an out-of-range dimming level', () => {
    const telemetry = loadFixture('telemetry.json') as { lamp: { dimPercent: number } };
    telemetry.lamp.dimPercent = 140;

    expect(telemetryPayloadSchema.safeParse(telemetry).success).toBe(false);
  });

  it('rejects an OTA command with a non-HTTPS firmware URL', () => {
    const result = deviceCommandSchema.safeParse({
      v: 1,
      cmdId: '7b0f3c2e-5d4a-4b8e-9f1a-2c3d4e5f6a7b',
      issuedAt: 1763836300,
      expiresAt: 1763836600,
      action: 'ota_update',
      firmwareVersion: '1.1.0',
      url: 'http://firmware.example.com/sl.bin',
      sha256: 'a'.repeat(64),
    });

    expect(result.success).toBe(false);
  });

  it('rejects payloads from an unknown schema version', () => {
    const telemetry = loadFixture('telemetry.json') as { v: number };
    telemetry.v = 2;

    expect(telemetryPayloadSchema.safeParse(telemetry).success).toBe(false);
  });
});
