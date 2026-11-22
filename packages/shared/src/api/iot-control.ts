import { z } from 'zod';
import { SCHEDULE_MAX_STEPS, scheduleStepSchema } from '../iot/payloads';
import { paginationQuerySchema } from '../schemas/pagination';

// ─── Light control (operator → controllers) ──────────────────────────────────

/** Manual overrides always end by themselves; 7 days is the protocol maximum. */
export const CONTROL_MAX_DURATION_MINUTES = 7 * 24 * 60;
/** Technicians may only switch a lamp briefly to test their repair. */
export const TECHNICIAN_TEST_MAX_MINUTES = 15;

const durationMinutes = z.number().int().min(1).max(CONTROL_MAX_DURATION_MINUTES);

/**
 * `on` / `off` override the schedule for `durationMinutes`, then the controller
 * returns to its schedule by itself; `auto` ends an override immediately.
 */
export const lightControlSchema = z
  .discriminatedUnion('action', [
    z.object({
      action: z.literal('on'),
      dimPercent: z.number().int().min(10).max(100).default(100),
      durationMinutes,
    }),
    z.object({ action: z.literal('off'), durationMinutes }),
    z.object({ action: z.literal('auto') }),
  ])
  .meta({ id: 'LightControlRequest' });

export type LightControlInput = z.input<typeof lightControlSchema>;

/** What to switch: one pole, every pole of a zone, or the whole city. */
export const controlTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pole'), poleId: z.uuid() }),
  z.object({ type: z.literal('zone'), zoneId: z.uuid() }),
  z.object({ type: z.literal('city') }),
]);

export const lightingCommandRequestSchema = z
  .object({ target: controlTargetSchema, control: lightControlSchema })
  .meta({ id: 'LightingCommandRequest' });

export type LightingCommandRequest = z.input<typeof lightingCommandRequestSchema>;

export const DEVICE_COMMAND_STATUSES = [
  'PENDING',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'COMPLETED',
  'FAILED',
  'EXPIRED',
] as const;
export const deviceCommandStatusSchema = z.enum(DEVICE_COMMAND_STATUSES);
export type DeviceCommandStatusName = z.infer<typeof deviceCommandStatusSchema>;

export const deviceCommandDtoSchema = z
  .object({
    id: z.uuid(),
    action: z.string(),
    status: deviceCommandStatusSchema,
    reason: z.string().nullable(),
    /** Human summary of what was asked (e.g. on at 70 % until …). */
    on: z.boolean().nullable(),
    dimPercent: z.number().int().nullable(),
    until: z.iso.datetime().nullable(),
    createdBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    createdAt: z.iso.datetime(),
    ackAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'DeviceCommand' });

export type DeviceCommandDto = z.infer<typeof deviceCommandDtoSchema>;

export const controlResultSchema = z
  .object({
    /** Controllers the command was queued for. */
    queued: z.number().int(),
    /** Poles skipped because they have no controller. */
    withoutController: z.number().int(),
  })
  .meta({ id: 'LightControlResult' });

export type ControlResultDto = z.infer<typeof controlResultSchema>;

// ─── Device events (alerts) ──────────────────────────────────────────────────

export const deviceEventDtoSchema = z
  .object({
    id: z.uuid(),
    type: z.string(),
    severity: z.enum(['info', 'warning', 'critical']),
    clears: z.string().nullable(),
    message: z.string().nullable(),
    receivedAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
    workOrderId: z.uuid().nullable(),
    deviceId: z.string(),
    pole: z.object({ id: z.uuid(), code: z.string(), address: z.string().nullable() }).nullable(),
  })
  .meta({ id: 'DeviceEvent' });

export type DeviceEventDto = z.infer<typeof deviceEventDtoSchema>;

export const listDeviceEventsQuerySchema = paginationQuerySchema.extend({
  /** Only faults that have not cleared (default true). */
  open: z.stringbool().default(true),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  poleId: z.uuid().optional(),
  tenantId: z.uuid().optional(),
});

// ─── Live state of one pole ──────────────────────────────────────────────────

export const poleLiveSchema = z
  .object({
    device: z
      .object({
        deviceId: z.string(),
        online: z.boolean(),
        lastSeenAt: z.iso.datetime().nullable(),
        firmwareVersion: z.string().nullable(),
        lampOn: z.boolean().nullable(),
        dimPercent: z.number().int().nullable(),
        mode: z.string().nullable(),
        lastTelemetryAt: z.iso.datetime().nullable(),
        voltageV: z.number().nullable(),
        currentA: z.number().nullable(),
        powerW: z.number().nullable(),
        energyWh: z.number().nullable(),
        rssiDbm: z.number().int().nullable(),
        network: z.string().nullable(),
        boardTempC: z.number().nullable(),
        scheduleInSync: z.boolean(),
      })
      .nullable(),
    /** Power draw over the last 24 h, oldest first (at most 288 points). */
    readings: z.array(
      z.object({
        at: z.iso.datetime(),
        powerW: z.number(),
        voltageV: z.number(),
        lampOn: z.boolean(),
        dimPercent: z.number().int(),
      }),
    ),
    events: z.array(deviceEventDtoSchema),
    commands: z.array(deviceCommandDtoSchema),
    schedule: z.object({ id: z.uuid(), name: z.string(), fromZone: z.boolean() }).nullable(),
  })
  .meta({ id: 'PoleLive' });

export type PoleLiveDto = z.infer<typeof poleLiveSchema>;

// ─── Schedules ───────────────────────────────────────────────────────────────

export const scheduleDtoSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    steps: z.array(scheduleStepSchema),
    isDefault: z.boolean(),
    zones: z.array(z.object({ id: z.uuid(), code: z.string(), name: z.string() })),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Schedule' });

export type ScheduleDto = z.infer<typeof scheduleDtoSchema>;

export const saveScheduleSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    steps: z.array(scheduleStepSchema).min(1).max(SCHEDULE_MAX_STEPS),
    /** Make this the city's default (poles whose zone has no schedule). */
    isDefault: z.boolean().default(false),
  })
  .meta({ id: 'SaveScheduleRequest' });

export const assignZoneScheduleSchema = z
  .object({ scheduleId: z.uuid().nullable() })
  .meta({ id: 'AssignZoneScheduleRequest' });
