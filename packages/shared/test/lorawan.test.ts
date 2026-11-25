import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  CommandAckStatus,
  decodeLorawanCommand,
  decodeLorawanCommandAck,
  decodeLorawanEvent,
  decodeLorawanTelemetry,
  DeviceEventSeverity,
  DeviceEventType,
  encodeLorawanCommand,
  encodeLorawanCommandAck,
  encodeLorawanEvent,
  encodeLorawanTelemetry,
  LightOperatingMode,
  LORAWAN_MAX_PAYLOAD_DR0,
  LorawanDecodeError,
} from '../src';

const telemetry = {
  lampOn: true,
  dimPercent: 70,
  mode: LightOperatingMode.Auto,
  motionDetected: true,
  isDark: true,
  voltageV: 231.4,
  currentA: 0.412,
  powerW: 89.6,
  energyWh: 123_456,
  boardTempC: 41,
  ts: 1_795_000_000,
  uptimeSec: 86_400,
};

describe('LoRaWAN compact frames', () => {
  it('round-trips telemetry in 22 bytes', () => {
    const bytes = encodeLorawanTelemetry(telemetry);
    expect(bytes).toHaveLength(22);
    expect(decodeLorawanTelemetry(bytes)).toEqual(telemetry);
  });

  it('omits sensors that are not fitted instead of inventing values', () => {
    const { isDark: _dark, boardTempC: _temp, ...withoutSensors } = telemetry;
    const decoded = decodeLorawanTelemetry(encodeLorawanTelemetry(withoutSensors));
    expect(decoded).not.toHaveProperty('isDark');
    expect(decoded).not.toHaveProperty('boardTempC');
  });

  it('pins the telemetry byte layout (firmware must match)', () => {
    expect(bytesToHex(encodeLorawanTelemetry(telemetry))).toBe(
      '01 0f 46 090a 019c 0380 0001e240 29 6afd86c0 00015180'.replace(/ /g, ''),
    );
  });

  it('round-trips events, acknowledgements and commands', () => {
    const event = {
      type: DeviceEventType.FaultCleared,
      severity: DeviceEventSeverity.Info,
      ts: 1_795_000_100,
      clears: DeviceEventType.LampFailure,
    };
    expect(decodeLorawanEvent(encodeLorawanEvent(event))).toEqual(event);

    const ack = {
      cmdId: '01a2b3c4-d5e6-7f80-9a1b-2c3d4e5f6a7b',
      status: CommandAckStatus.Completed,
    };
    expect(encodeLorawanCommandAck(ack)).toHaveLength(18);
    expect(decodeLorawanCommandAck(encodeLorawanCommandAck(ack))).toEqual(ack);

    const output = {
      cmdId: ack.cmdId,
      action: 'set_output' as const,
      on: true,
      dimPercent: 50,
      overrideUntil: 1_795_003_600,
      expiresAt: 1_795_000_600,
    };
    const auto = { cmdId: ack.cmdId, action: 'set_auto' as const, expiresAt: 1_795_000_600 };
    for (const command of [output, auto]) {
      const bytes = encodeLorawanCommand(command);
      expect(bytes.length).toBeLessThanOrEqual(LORAWAN_MAX_PAYLOAD_DR0);
      expect(decodeLorawanCommand(bytes)).toEqual(command);
    }
  });

  it('rejects malformed frames', () => {
    expect(() => decodeLorawanTelemetry(new Uint8Array(21))).toThrow(LorawanDecodeError);
    const wrongVersion = encodeLorawanTelemetry(telemetry);
    wrongVersion[0] = 2;
    expect(() => decodeLorawanTelemetry(wrongVersion)).toThrow(LorawanDecodeError);
    const badDim = encodeLorawanTelemetry(telemetry);
    badDim[2] = 101;
    expect(() => decodeLorawanTelemetry(badDim)).toThrow(LorawanDecodeError);
    const badEvent = encodeLorawanEvent({
      type: DeviceEventType.Boot,
      severity: DeviceEventSeverity.Info,
      ts: 0,
    });
    badEvent[1] = 99;
    expect(() => decodeLorawanEvent(badEvent)).toThrow(LorawanDecodeError);
  });

  it('converts base64 like the network server sends it', () => {
    const bytes = encodeLorawanTelemetry(telemetry);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});
