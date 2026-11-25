/**
 * Compact LoRaWAN payloads, version 1.
 *
 * LoRaWAN frames are small (IN865: 51 bytes at DR0–DR2), so the controller sends
 * binary frames over its RAK3172 link instead of the JSON documents it uses over
 * Wi-Fi / 4G. The backend decodes them into the same v1 payload objects, so one
 * pipeline (readings, faults, work orders, commands) serves every link.
 *
 * Big-endian. Each frame starts with a version byte. Ports:
 *   10 telemetry  (uplink, 22 bytes)
 *   20 event      (uplink, 8 bytes)
 *   30 cmd ack    (uplink, 18 bytes)
 *   40 command    (downlink, 28 / 22 bytes) — set_output / set_auto only; schedules
 *                                         travel over Wi-Fi / 4G (too large).
 *
 * Runtime-agnostic: Uint8Array + DataView only. Keep in sync with
 * firmware/street-light-controller/main/include/sl_protocol.h and
 * docs/iot/lorawan-payloads.md.
 */
import {
  CommandAckStatus,
  DeviceEventSeverity,
  DeviceEventType,
  LightOperatingMode,
} from './payloads';

export const LORAWAN_PAYLOAD_VERSION = 1;

export const LorawanPort = {
  Telemetry: 10,
  Event: 20,
  CommandAck: 30,
  Command: 40,
} as const;

/** IN865 maximum application payload at the slowest data rates (DR0–DR2). */
export const LORAWAN_MAX_PAYLOAD_DR0 = 51;

const MODES: LightOperatingMode[] = [
  LightOperatingMode.Auto,
  LightOperatingMode.Manual,
  LightOperatingMode.FailSafe,
];

/** Event codes on the air; 0 = none. Never reorder (firmware uses the numbers). */
export const LORAWAN_EVENT_CODES: Record<DeviceEventType, number> = {
  [DeviceEventType.LampFailure]: 1,
  [DeviceEventType.RelayStuck]: 2,
  [DeviceEventType.DayBurning]: 3,
  [DeviceEventType.OverCurrent]: 4,
  [DeviceEventType.OverVoltage]: 5,
  [DeviceEventType.UnderVoltage]: 6,
  [DeviceEventType.SensorFault]: 7,
  [DeviceEventType.FaultCleared]: 8,
  [DeviceEventType.Boot]: 9,
};
const EVENT_BY_CODE = new Map(
  Object.entries(LORAWAN_EVENT_CODES).map(([type, code]) => [code, type as DeviceEventType]),
);
const SEVERITIES = [
  DeviceEventSeverity.Info,
  DeviceEventSeverity.Warning,
  DeviceEventSeverity.Critical,
];
const ACK_STATUSES = [
  CommandAckStatus.Accepted,
  CommandAckStatus.Rejected,
  CommandAckStatus.Completed,
  CommandAckStatus.Failed,
];

export class LorawanDecodeError extends Error {}

function view(bytes: Uint8Array, length: number, port: number): DataView {
  if (bytes.length !== length) {
    throw new LorawanDecodeError(`Port ${port}: expected ${length} bytes, got ${bytes.length}`);
  }
  if (bytes[0] !== LORAWAN_PAYLOAD_VERSION) {
    throw new LorawanDecodeError(`Port ${port}: unsupported version ${bytes[0]}`);
  }
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function uuidToBytes(uuid: string, target: Uint8Array, offset: number): void {
  const hex = uuid.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new LorawanDecodeError('Invalid command id');
  }
  for (let index = 0; index < 16; index++) {
    target[offset + index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
}

function bytesToUuid(bytes: Uint8Array, offset: number): string {
  const hex = [...bytes.subarray(offset, offset + 16)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ─── Telemetry (port 10) ─────────────────────────────────────────────────────

export interface LorawanTelemetry {
  lampOn: boolean;
  dimPercent: number;
  mode: LightOperatingMode;
  motionDetected: boolean;
  /** Undefined when the controller has no light sensor (BH1750 is optional). */
  isDark?: boolean;
  voltageV: number;
  currentA: number;
  powerW: number;
  energyWh: number;
  /** Undefined when not measured. */
  boardTempC?: number;
  /** Device clock, Unix seconds; 0 = not synced. */
  ts: number;
  uptimeSec: number;
}

const TELEMETRY_BYTES = 22;
const NO_TEMPERATURE = -128;

export function encodeLorawanTelemetry(value: LorawanTelemetry): Uint8Array {
  const bytes = new Uint8Array(TELEMETRY_BYTES);
  const data = new DataView(bytes.buffer);
  const modeIndex = Math.max(0, MODES.indexOf(value.mode));
  let flags = 0;
  if (value.lampOn) flags |= 0x01;
  if (value.motionDetected) flags |= 0x02;
  if (value.isDark !== undefined) {
    flags |= 0x08;
    if (value.isDark) flags |= 0x04;
  }
  flags |= modeIndex << 4;
  data.setUint8(0, LORAWAN_PAYLOAD_VERSION);
  data.setUint8(1, flags);
  data.setUint8(2, Math.round(value.dimPercent));
  data.setUint16(3, Math.round(value.voltageV * 10));
  data.setUint16(5, Math.round(value.currentA * 1000));
  data.setUint16(7, Math.round(value.powerW * 10));
  data.setUint32(9, Math.round(value.energyWh));
  data.setInt8(13, value.boardTempC === undefined ? NO_TEMPERATURE : Math.round(value.boardTempC));
  data.setUint32(14, value.ts);
  data.setUint32(18, value.uptimeSec);
  return bytes;
}

export function decodeLorawanTelemetry(bytes: Uint8Array): LorawanTelemetry {
  const data = view(bytes, TELEMETRY_BYTES, LorawanPort.Telemetry);
  const flags = data.getUint8(1);
  const mode = MODES[(flags >> 4) & 0x03];
  const dimPercent = data.getUint8(2);
  if (!mode || dimPercent > 100) {
    throw new LorawanDecodeError('Port 10: value out of range');
  }
  const temperature = data.getInt8(13);
  return {
    lampOn: (flags & 0x01) !== 0,
    motionDetected: (flags & 0x02) !== 0,
    ...((flags & 0x08) !== 0 ? { isDark: (flags & 0x04) !== 0 } : {}),
    mode,
    dimPercent,
    voltageV: data.getUint16(3) / 10,
    currentA: data.getUint16(5) / 1000,
    powerW: data.getUint16(7) / 10,
    energyWh: data.getUint32(9),
    ...(temperature === NO_TEMPERATURE ? {} : { boardTempC: temperature }),
    ts: data.getUint32(14),
    uptimeSec: data.getUint32(18),
  };
}

// ─── Event (port 20) ─────────────────────────────────────────────────────────

export interface LorawanEvent {
  type: DeviceEventType;
  severity: DeviceEventSeverity;
  ts: number;
  clears?: DeviceEventType;
}

const EVENT_BYTES = 8;

export function encodeLorawanEvent(value: LorawanEvent): Uint8Array {
  const bytes = new Uint8Array(EVENT_BYTES);
  const data = new DataView(bytes.buffer);
  data.setUint8(0, LORAWAN_PAYLOAD_VERSION);
  data.setUint8(1, LORAWAN_EVENT_CODES[value.type]);
  data.setUint8(2, SEVERITIES.indexOf(value.severity));
  data.setUint32(3, value.ts);
  data.setUint8(7, value.clears ? LORAWAN_EVENT_CODES[value.clears] : 0);
  return bytes;
}

export function decodeLorawanEvent(bytes: Uint8Array): LorawanEvent {
  const data = view(bytes, EVENT_BYTES, LorawanPort.Event);
  const type = EVENT_BY_CODE.get(data.getUint8(1));
  const severity = SEVERITIES[data.getUint8(2)];
  const clearsCode = data.getUint8(7);
  const clears = clearsCode === 0 ? undefined : EVENT_BY_CODE.get(clearsCode);
  if (!type || !severity || (clearsCode !== 0 && !clears)) {
    throw new LorawanDecodeError('Port 20: unknown event or severity');
  }
  return { type, severity, ts: data.getUint32(3), ...(clears ? { clears } : {}) };
}

// ─── Command acknowledgement (port 30) ───────────────────────────────────────

export interface LorawanCommandAck {
  cmdId: string;
  status: CommandAckStatus;
}

const ACK_BYTES = 18;

export function encodeLorawanCommandAck(value: LorawanCommandAck): Uint8Array {
  const bytes = new Uint8Array(ACK_BYTES);
  bytes[0] = LORAWAN_PAYLOAD_VERSION;
  uuidToBytes(value.cmdId, bytes, 1);
  bytes[17] = ACK_STATUSES.indexOf(value.status);
  return bytes;
}

export function decodeLorawanCommandAck(bytes: Uint8Array): LorawanCommandAck {
  view(bytes, ACK_BYTES, LorawanPort.CommandAck);
  const status = ACK_STATUSES[bytes[17] ?? 255];
  if (!status) {
    throw new LorawanDecodeError('Port 30: unknown status');
  }
  return { cmdId: bytesToUuid(bytes, 1), status };
}

// ─── Command (port 40, downlink) ─────────────────────────────────────────────

export type LorawanCommand =
  | {
      cmdId: string;
      action: 'set_output';
      on: boolean;
      dimPercent: number;
      /** Unix seconds; the device returns to its schedule after this. */
      overrideUntil: number;
      /** Unix seconds; the device rejects the command after this. */
      expiresAt: number;
    }
  | { cmdId: string; action: 'set_auto'; expiresAt: number };

/** set_output: version, cmd id, action, on, dim, overrideUntil, expiresAt. */
const SET_OUTPUT_BYTES = 28;
/** set_auto: version, cmd id, action, expiresAt. */
const SET_AUTO_BYTES = 22;
const ACTION_CODES = { set_output: 1, set_auto: 2 } as const;

export function encodeLorawanCommand(value: LorawanCommand): Uint8Array {
  const bytes = new Uint8Array(value.action === 'set_output' ? SET_OUTPUT_BYTES : SET_AUTO_BYTES);
  const data = new DataView(bytes.buffer);
  data.setUint8(0, LORAWAN_PAYLOAD_VERSION);
  uuidToBytes(value.cmdId, bytes, 1);
  data.setUint8(17, ACTION_CODES[value.action]);
  if (value.action === 'set_output') {
    data.setUint8(18, value.on ? 1 : 0);
    data.setUint8(19, Math.round(value.dimPercent));
    data.setUint32(20, value.overrideUntil);
    data.setUint32(24, value.expiresAt);
  } else {
    data.setUint32(18, value.expiresAt);
  }
  return bytes;
}

export function decodeLorawanCommand(bytes: Uint8Array): LorawanCommand {
  if (bytes[0] !== LORAWAN_PAYLOAD_VERSION || bytes.length < SET_AUTO_BYTES) {
    throw new LorawanDecodeError('Port 40: unsupported command frame');
  }
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cmdId = bytesToUuid(bytes, 1);
  const action = data.getUint8(17);
  if (action === ACTION_CODES.set_output && bytes.length === SET_OUTPUT_BYTES) {
    const dimPercent = data.getUint8(19);
    if (dimPercent > 100) {
      throw new LorawanDecodeError('Port 40: brightness out of range');
    }
    return {
      cmdId,
      action: 'set_output',
      on: data.getUint8(18) === 1,
      dimPercent,
      overrideUntil: data.getUint32(20),
      expiresAt: data.getUint32(24),
    };
  }
  if (action === ACTION_CODES.set_auto && bytes.length === SET_AUTO_BYTES) {
    return { cmdId, action: 'set_auto', expiresAt: data.getUint32(18) };
  }
  throw new LorawanDecodeError('Port 40: unknown command');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** DevEUI / JoinEUI / gateway id: 16 hex characters, stored lower-case. */
export const EUI64_PATTERN = /^[0-9a-f]{16}$/;
