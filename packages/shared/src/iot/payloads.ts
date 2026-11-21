import { z } from 'zod';

/**
 * Device <-> cloud MQTT payload contract, schema version 1.
 * Every payload carries `v` (schema version) so firmware and backend can evolve independently.
 * Keep in sync with firmware/street-light-controller/main/include/sl_protocol.h
 * and docs/iot/mqtt-protocol.md.
 */

export const IOT_SCHEMA_VERSION = 1;

const schemaVersion = z.literal(IOT_SCHEMA_VERSION);

/** Device wall-clock time in Unix epoch seconds (0 when the clock is not yet synced). */
const deviceTimestamp = z.number().int().nonnegative();

/** Monotonic per-boot message counter; lets the backend detect drops and duplicates. */
const sequenceNumber = z.number().int().nonnegative();

export enum LightOperatingMode {
  /** Follows the downloaded schedule (requires a synced clock). */
  Auto = 'auto',
  /** Operator override from the municipal console; expires at `overrideUntil`. */
  Manual = 'manual',
  /**
   * No schedule or no valid clock: device switches by LDR (on when dark, full brightness).
   * Lighting never depends on connectivity; if the LDR fails the lamp fails ON.
   */
  FailSafe = 'failsafe',
}

export enum NetworkInterface {
  Cellular = 'cellular',
  Wifi = 'wifi',
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

export const telemetryPayloadSchema = z.object({
  v: schemaVersion,
  ts: deviceTimestamp,
  seq: sequenceNumber,
  lamp: z.object({
    /** Relay state commanded by the controller. */
    on: z.boolean(),
    /** Dimming output, 0–100 %. */
    dimPercent: z.number().int().min(0).max(100),
    mode: z.nativeEnum(LightOperatingMode),
  }),
  electrical: z.object({
    voltageV: z.number().min(0).max(500),
    currentA: z.number().min(0).max(50),
    powerW: z.number().min(0).max(25_000),
    /** Cumulative energy since commissioning, persisted in NVS. */
    energyWh: z.number().nonnegative(),
    powerFactor: z.number().min(0).max(1).optional(),
  }),
  environment: z.object({
    /** LDR verdict after hysteresis. */
    isDark: z.boolean(),
    /** BH1750 reading; absent when the optional sensor is not fitted. */
    ambientLux: z.number().nonnegative().optional(),
    /** Radar presence detected within the reporting window. */
    motionDetected: z.boolean(),
  }),
  device: z.object({
    firmwareVersion: z.string().min(1).max(32),
    uptimeSec: z.number().int().nonnegative(),
    network: z.nativeEnum(NetworkInterface),
    /** Signal strength in dBm (Wi-Fi RSSI or cellular RSSI). */
    rssiDbm: z.number().int().min(-140).max(0),
    boardTempC: z.number().min(-40).max(125).optional(),
  }),
});

export type TelemetryPayload = z.infer<typeof telemetryPayloadSchema>;

// ─── Status (retained, Last Will) ─────────────────────────────────────────────

export const deviceStatusPayloadSchema = z.object({
  v: schemaVersion,
  ts: deviceTimestamp,
  online: z.boolean(),
  firmwareVersion: z.string().min(1).max(32).optional(),
  /** ESP-IDF reset reason of the latest boot (e.g. `poweron`, `panic`, `brownout`). */
  resetReason: z.string().max(32).optional(),
});

export type DeviceStatusPayload = z.infer<typeof deviceStatusPayloadSchema>;

// ─── Events / faults ──────────────────────────────────────────────────────────

export enum DeviceEventType {
  /** Relay ON but no lamp current: lamp, driver or wiring failure. */
  LampFailure = 'lamp_failure',
  /** Relay OFF but current flowing: welded relay contacts or bypass. */
  RelayStuck = 'relay_stuck',
  /** Lamp ON while ambient light indicates daytime (energy waste). */
  DayBurning = 'day_burning',
  OverCurrent = 'over_current',
  OverVoltage = 'over_voltage',
  UnderVoltage = 'under_voltage',
  /** A sensor stopped responding or returned out-of-range data. */
  SensorFault = 'sensor_fault',
  /** A previously raised fault has cleared. */
  FaultCleared = 'fault_cleared',
  /** Device booted (includes reset reason in `message`). */
  Boot = 'boot',
}

export enum DeviceEventSeverity {
  Info = 'info',
  Warning = 'warning',
  Critical = 'critical',
}

export const deviceEventPayloadSchema = z.object({
  v: schemaVersion,
  ts: deviceTimestamp,
  seq: sequenceNumber,
  type: z.nativeEnum(DeviceEventType),
  severity: z.nativeEnum(DeviceEventSeverity),
  /** For `fault_cleared`: the event type that cleared. */
  clears: z.nativeEnum(DeviceEventType).optional(),
  /** Readings at the moment of the event, for diagnosis. */
  snapshot: z
    .object({
      voltageV: z.number().optional(),
      currentA: z.number().optional(),
      lampOn: z.boolean().optional(),
    })
    .optional(),
  message: z.string().max(200).optional(),
});

export type DeviceEventPayload = z.infer<typeof deviceEventPayloadSchema>;

// ─── Commands (cloud → device) ────────────────────────────────────────────────

/** Daily schedule entry, minutes after local midnight (device timezone, e.g. IST). */
export const scheduleStepSchema = z.object({
  atMinute: z.number().int().min(0).max(1439),
  on: z.boolean(),
  dimPercent: z.number().int().min(0).max(100),
});

export type ScheduleStep = z.infer<typeof scheduleStepSchema>;

export const SCHEDULE_MAX_STEPS = 12;

const commandBase = {
  v: schemaVersion,
  /** UUID used to correlate the acknowledgement and for idempotency on retries. */
  cmdId: z.string().uuid(),
  issuedAt: deviceTimestamp,
  /** Device must reject commands received after this time (stale command protection). */
  expiresAt: deviceTimestamp,
};

export const deviceCommandSchema = z.discriminatedUnion('action', [
  z.object({
    ...commandBase,
    action: z.literal('set_output'),
    on: z.boolean(),
    dimPercent: z.number().int().min(0).max(100),
    /** Manual override lasts until this time, then the device returns to `auto`. */
    overrideUntil: deviceTimestamp,
  }),
  z.object({
    ...commandBase,
    action: z.literal('set_auto'),
  }),
  z.object({
    ...commandBase,
    action: z.literal('set_schedule'),
    scheduleId: z.string().min(1).max(64),
    /** Offset from UTC in minutes (IST = 330). */
    utcOffsetMinutes: z.number().int().min(-720).max(840),
    steps: z.array(scheduleStepSchema).min(1).max(SCHEDULE_MAX_STEPS),
  }),
  z.object({
    ...commandBase,
    action: z.literal('set_config'),
    telemetryIntervalSec: z.number().int().min(30).max(3600).optional(),
    /** Radar motion boost: raise dimming to this level while presence is detected. */
    motionBoostPercent: z.number().int().min(0).max(100).optional(),
  }),
  z.object({
    ...commandBase,
    action: z.literal('ota_update'),
    firmwareVersion: z.string().min(1).max(32),
    /** HTTPS URL of the signed firmware image. */
    url: z.string().url().startsWith('https://'),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({
    ...commandBase,
    action: z.literal('reboot'),
  }),
]);

export type DeviceCommand = z.infer<typeof deviceCommandSchema>;
export type DeviceCommandAction = DeviceCommand['action'];

// ─── Command acknowledgement (device → cloud) ─────────────────────────────────

export enum CommandAckStatus {
  /** Valid and applied (or OTA download started). */
  Accepted = 'accepted',
  /** Rejected: invalid, expired, or unsupported. See `reason`. */
  Rejected = 'rejected',
  /** Long-running command (OTA) finished successfully. */
  Completed = 'completed',
  /** Long-running command (OTA) failed. See `reason`. */
  Failed = 'failed',
}

export const commandAckPayloadSchema = z.object({
  v: schemaVersion,
  ts: deviceTimestamp,
  cmdId: z.string().uuid(),
  status: z.nativeEnum(CommandAckStatus),
  reason: z.string().max(120).optional(),
});

export type CommandAckPayload = z.infer<typeof commandAckPayloadSchema>;
