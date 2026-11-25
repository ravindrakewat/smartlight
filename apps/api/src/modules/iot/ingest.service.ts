/**
 * Turns controller messages into platform state. Called by the MQTT bridge for
 * every message; each handler validates its payload with the shared contract
 * and never throws for bad device data (it is logged and dropped instead).
 *
 * - telemetry → reading history, latest device state, pole light status,
 *               automatic verification of repairs
 * - status    → online/offline; a controller coming back gets its schedule
 * - event     → fault history; critical lamp faults open a work order (once)
 * - cmd/ack   → command outcome; an accepted schedule is recorded as applied
 */
import type { LightStatus, Prisma } from '@smart-light/db';
import {
  commandAckPayloadSchema,
  deviceEventPayloadSchema,
  deviceStatusPayloadSchema,
  DeviceTopicChannel,
  telemetryPayloadSchema,
  type DeviceEventPayload,
  type TelemetryPayload,
} from '@smart-light/shared';
import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { recordAudit } from '../audit/audit.service';
import { createWorkOrderTx, workOrdersService } from '../work-orders/work-orders.service';
import { commandsService, scheduleVersionId } from './commands.service';

/** Below this the lamp is considered dark even though the relay is on (amps). */
export const LAMP_MIN_CURRENT_A = 0.05;

/** Faults that mean the light is out (or unsafe) and need a technician. */
const REPAIR_FAULTS = new Set(['lamp_failure', 'relay_stuck', 'over_current']);
/** Faults that make the pole show as faulty on the map. */
const LIGHT_FAULTS = REPAIR_FAULTS;

const OPEN_WORK_ORDER = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_VERIFICATION'] as const;

export type IngestOutcome =
  'stored' | 'duplicate' | 'unknown_device' | 'invalid_payload' | 'ignored';

async function findDevice(tenantSlug: string, deviceId: string) {
  const device = await prisma.device.findUnique({
    where: { deviceId },
    include: { tenant: { select: { slug: true } } },
  });
  // A controller may only speak for its own municipality (topic tenant must match).
  if (!device || device.tenant.slug !== tenantSlug) {
    return null;
  }
  return device;
}

type KnownDevice = NonNullable<Awaited<ReturnType<typeof findDevice>>>;

async function hasOpenLightFault(deviceId: string): Promise<boolean> {
  const fault = await prisma.deviceEvent.findFirst({
    where: { deviceId, resolvedAt: null, type: { in: [...LIGHT_FAULTS] } },
    select: { id: true },
  });
  return fault !== null;
}

function lightStatusFrom(telemetry: TelemetryPayload, faulty: boolean): LightStatus {
  if (faulty) {
    return 'FAULT';
  }
  if (!telemetry.lamp.on) {
    return 'OFF';
  }
  return telemetry.lamp.dimPercent < 100 ? 'DIMMED' : 'ON';
}

/** Which link carried a message, and its radio quality where the network reports it. */
export interface LinkMeta {
  via?: 'wifi' | 'cellular' | 'lorawan';
  snrDb?: number;
}

async function handleTelemetry(
  device: KnownDevice,
  payload: unknown,
  meta: LinkMeta = {},
): Promise<IngestOutcome> {
  const parsed = telemetryPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return 'invalid_payload';
  }
  const telemetry = parsed.data;
  const now = new Date();
  const faulty = await hasOpenLightFault(device.id);

  await prisma.$transaction([
    prisma.deviceReading.create({
      data: {
        deviceId: device.id,
        tenantId: device.tenantId,
        deviceTs: telemetry.ts,
        lampOn: telemetry.lamp.on,
        dimPercent: telemetry.lamp.dimPercent,
        mode: telemetry.lamp.mode,
        voltageV: telemetry.electrical.voltageV,
        currentA: telemetry.electrical.currentA,
        powerW: telemetry.electrical.powerW,
        energyWh: telemetry.electrical.energyWh,
        rssiDbm: telemetry.device.rssiDbm,
        snrDb: meta.snrDb ?? null,
        via: meta.via ?? telemetry.device.network,
        boardTempC: telemetry.device.boardTempC ?? null,
        motion: telemetry.environment.motionDetected,
      },
    }),
    prisma.device.update({
      where: { id: device.id },
      data: {
        online: true,
        lastSeenAt: now,
        lampOn: telemetry.lamp.on,
        dimPercent: telemetry.lamp.dimPercent,
        mode: telemetry.lamp.mode,
        lastTelemetry: telemetry as Prisma.InputJsonValue,
        lastTelemetryAt: now,
        firmwareVersion: telemetry.device.firmwareVersion,
      },
    }),
    ...(device.poleId
      ? [
          prisma.pole.update({
            where: { id: device.poleId },
            data: { lightStatus: lightStatusFrom(telemetry, faulty), lightStatusAt: now },
          }),
        ]
      : []),
  ]);

  // A lamp that is switched on tells us whether a repair worked.
  if (device.poleId && telemetry.lamp.on) {
    const working = telemetry.electrical.currentA >= LAMP_MIN_CURRENT_A;
    await workOrdersService.verifyFromTelemetry(device.poleId, working);
  }
  return 'stored';
}

async function handleStatus(device: KnownDevice, payload: unknown): Promise<IngestOutcome> {
  const parsed = deviceStatusPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return 'invalid_payload';
  }
  const status = parsed.data;
  const cameOnline = status.online && !device.online;
  await prisma.device.update({
    where: { id: device.id },
    data: {
      online: status.online,
      lastSeenAt: new Date(),
      ...(status.firmwareVersion ? { firmwareVersion: status.firmwareVersion } : {}),
      ...(status.resetReason ? { resetReason: status.resetReason } : {}),
    },
  });
  if (device.poleId && !status.online) {
    await prisma.pole.update({
      where: { id: device.poleId },
      data: { lightStatus: 'OFFLINE', lightStatusAt: new Date() },
    });
  }
  // A controller that (re)connects gets the schedule that applies now, if it lacks it.
  if (cameOnline && device.poleId) {
    await syncScheduleIfStale(device);
  }
  return 'stored';
}

async function syncScheduleIfStale(device: KnownDevice): Promise<void> {
  const pole = await prisma.pole.findUnique({
    where: { id: device.poleId ?? '' },
    select: { zone: { select: { schedule: true } } },
  });
  const schedule =
    pole?.zone?.schedule ??
    (await prisma.schedule.findFirst({ where: { tenantId: device.tenantId, isDefault: true } }));
  if (schedule && device.appliedScheduleId !== scheduleVersionId(schedule)) {
    await commandsService.syncSchedules(prisma, device.tenantId, { deviceIds: [device.id] });
  }
}

async function openRepairWorkOrder(
  device: KnownDevice,
  event: DeviceEventPayload,
  eventId: string,
): Promise<void> {
  const poleId = device.poleId;
  if (!poleId) {
    return;
  }
  await prisma.$transaction(async (tx) => {
    const existing = await tx.workOrder.findFirst({
      where: { poleId, status: { in: [...OPEN_WORK_ORDER] } },
      select: { id: true },
    });
    if (existing) {
      await tx.deviceEvent.update({ where: { id: eventId }, data: { workOrderId: existing.id } });
      return;
    }
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: device.tenantId },
      select: { id: true, code: true, slaHours: true },
    });
    const workOrder = await createWorkOrderTx(tx, {
      tenant,
      poleId,
      source: 'IOT_ALERT',
      priority: event.type === 'over_current' ? 'CRITICAL' : 'HIGH',
      faultType: event.type,
      description: event.message ?? null,
      note: `Raised automatically by controller ${device.deviceId}`,
    });
    await tx.deviceEvent.update({ where: { id: eventId }, data: { workOrderId: workOrder.id } });
    await recordAudit(
      {
        tenantId: device.tenantId,
        actorType: 'DEVICE',
        actorId: device.deviceId,
        action: 'work_order.create_iot',
        entityType: 'work_order',
        entityId: workOrder.id,
        metadata: { fault: event.type },
      },
      tx,
    );
  });
}

async function handleEvent(device: KnownDevice, payload: unknown): Promise<IngestOutcome> {
  const parsed = deviceEventPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return 'invalid_payload';
  }
  const event = parsed.data;

  // QoS 1 may deliver twice: same device, type, sequence and device time = same event.
  if (event.ts !== 0) {
    const duplicate = await prisma.deviceEvent.findFirst({
      where: { deviceId: device.id, type: event.type, seq: event.seq, deviceTs: event.ts },
      select: { id: true },
    });
    if (duplicate) {
      return 'duplicate';
    }
  }

  const now = new Date();
  const stored = await prisma.deviceEvent.create({
    data: {
      tenantId: device.tenantId,
      deviceId: device.id,
      poleId: device.poleId,
      type: event.type,
      severity: event.severity,
      clears: event.clears ?? null,
      message: event.message ?? null,
      ...(event.snapshot ? { snapshot: event.snapshot as Prisma.InputJsonValue } : {}),
      deviceTs: event.ts,
      seq: event.seq,
      // Informational events need no follow-up.
      resolvedAt: event.type === 'fault_cleared' || event.type === 'boot' ? now : null,
    },
  });

  if (event.type === 'fault_cleared' && event.clears) {
    await prisma.deviceEvent.updateMany({
      where: { deviceId: device.id, type: event.clears, resolvedAt: null },
      data: { resolvedAt: now },
    });
    if (device.poleId && event.clears === 'lamp_failure') {
      await workOrdersService.verifyFromTelemetry(device.poleId, true);
    }
    return 'stored';
  }

  if (REPAIR_FAULTS.has(event.type)) {
    if (device.poleId) {
      await prisma.pole.update({
        where: { id: device.poleId },
        data: { lightStatus: 'FAULT', lightStatusAt: now },
      });
    }
    await openRepairWorkOrder(device, event, stored.id);
  }
  return 'stored';
}

async function handleAck(device: KnownDevice, payload: unknown): Promise<IngestOutcome> {
  const parsed = commandAckPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return 'invalid_payload';
  }
  const ack = parsed.data;
  const command = await prisma.deviceCommand.findFirst({
    where: { id: ack.cmdId, deviceId: device.id },
  });
  if (!command) {
    return 'ignored';
  }
  const status = (
    {
      accepted: 'ACCEPTED',
      rejected: 'REJECTED',
      completed: 'COMPLETED',
      failed: 'FAILED',
    } as const
  )[ack.status];
  const now = new Date();
  // Protocol v1: `accepted` means valid and applied; `completed` ends a long job (OTA).
  const applied = status === 'ACCEPTED' || status === 'COMPLETED';
  await prisma.deviceCommand.update({
    where: { id: command.id },
    data: {
      status,
      reason: ack.reason ?? null,
      ackAt: command.ackAt ?? now,
      ...(applied ? { appliedAt: now } : {}),
    },
  });
  if (command.action === 'set_schedule' && status === 'ACCEPTED') {
    const scheduleId = (command.payload as { scheduleId?: unknown }).scheduleId;
    if (typeof scheduleId === 'string') {
      await prisma.device.update({
        where: { id: device.id },
        data: { appliedScheduleId: scheduleId },
      });
    }
  }
  return 'stored';
}

export const ingestService = {
  /** Entry point for one MQTT message (topic already parsed). */
  async handle(
    tenantSlug: string,
    deviceId: string,
    channel: DeviceTopicChannel,
    payload: unknown,
  ): Promise<IngestOutcome> {
    const device = await findDevice(tenantSlug, deviceId);
    if (!device) {
      logger.warn('Message from unknown controller dropped', { tenantSlug, deviceId, channel });
      return 'unknown_device';
    }
    let outcome: IngestOutcome;
    switch (channel) {
      case DeviceTopicChannel.Telemetry:
        outcome = await handleTelemetry(device, payload);
        break;
      case DeviceTopicChannel.Status:
        outcome = await handleStatus(device, payload);
        break;
      case DeviceTopicChannel.Event:
        outcome = await handleEvent(device, payload);
        break;
      case DeviceTopicChannel.CommandAck:
        outcome = await handleAck(device, payload);
        break;
      default:
        // Commands are published by us; ignore our own echo.
        outcome = 'ignored';
    }
    if (outcome === 'invalid_payload') {
      logger.warn('Invalid controller payload dropped', { deviceId, channel });
    }
    return outcome;
  },

  /**
   * Entry point for messages that did not come over the controller MQTT topics
   * (e.g. LoRaWAN frames decoded by the LoRaWAN service) for a known device id.
   */
  async handleForDevice(
    deviceRecordId: string,
    channel: DeviceTopicChannel,
    payload: unknown,
    meta: LinkMeta = {},
  ): Promise<IngestOutcome> {
    const device = await prisma.device.findUnique({
      where: { id: deviceRecordId },
      include: { tenant: { select: { slug: true } } },
    });
    if (!device) {
      return 'unknown_device';
    }
    switch (channel) {
      case DeviceTopicChannel.Telemetry:
        return handleTelemetry(device, payload, meta);
      case DeviceTopicChannel.Event:
        return handleEvent(device, payload);
      case DeviceTopicChannel.CommandAck:
        return handleAck(device, payload);
      case DeviceTopicChannel.Status:
        return handleStatus(device, payload);
      default:
        return 'ignored';
    }
  },

  /** Marks undelivered commands whose deadline passed as expired. */
  async expireCommands(): Promise<number> {
    const result = await prisma.deviceCommand.updateMany({
      where: { status: { in: ['PENDING', 'SENT'] }, expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED', reason: 'Not acknowledged in time' },
    });
    return result.count;
  },
};
