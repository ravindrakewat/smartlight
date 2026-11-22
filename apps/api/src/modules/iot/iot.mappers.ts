import type { Prisma } from '@smart-light/db';
import type {
  DeviceCommandDto,
  DeviceEventDto,
  ScheduleDto,
  ScheduleStep,
} from '@smart-light/shared';
import { toIso } from '../../lib/roles';

type CommandRow = Prisma.DeviceCommandGetPayload<object> & {
  createdBy?: { id: string; name: string } | null;
};

/** Summarises the protocol payload of a command for people. */
export function toCommandDto(command: CommandRow): DeviceCommandDto {
  const payload = command.payload as Record<string, unknown>;
  const issuedAt = typeof payload['issuedAt'] === 'number' ? payload['issuedAt'] : 0;
  const overrideUntil =
    typeof payload['overrideUntil'] === 'number' ? payload['overrideUntil'] : null;
  return {
    id: command.id,
    action: command.action,
    status: command.status,
    reason: command.reason,
    on: typeof payload['on'] === 'boolean' ? payload['on'] : null,
    dimPercent: typeof payload['dimPercent'] === 'number' ? payload['dimPercent'] : null,
    until:
      overrideUntil && issuedAt
        ? new Date(command.createdAt.getTime() + (overrideUntil - issuedAt) * 1000).toISOString()
        : null,
    createdBy: command.createdBy ?? null,
    createdAt: command.createdAt.toISOString(),
    ackAt: toIso(command.ackAt),
  };
}

type EventRow = Prisma.DeviceEventGetPayload<object> & {
  device: { deviceId: string; pole: { id: string; code: string; address: string | null } | null };
};

export function toEventDto(event: EventRow): DeviceEventDto {
  return {
    id: event.id,
    type: event.type,
    severity: event.severity as DeviceEventDto['severity'],
    clears: event.clears,
    message: event.message,
    receivedAt: event.receivedAt.toISOString(),
    resolvedAt: toIso(event.resolvedAt),
    workOrderId: event.workOrderId,
    deviceId: event.device.deviceId,
    pole: event.device.pole,
  };
}

type ScheduleRow = Prisma.ScheduleGetPayload<object> & {
  zones: { id: string; code: string; name: string }[];
};

export function toScheduleDto(schedule: ScheduleRow): ScheduleDto {
  return {
    id: schedule.id,
    name: schedule.name,
    steps: schedule.steps as ScheduleStep[],
    isDefault: schedule.isDefault,
    zones: schedule.zones,
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
  };
}

export const eventInclude = {
  device: {
    select: {
      deviceId: true,
      pole: { select: { id: true, code: true, address: true } },
    },
  },
} as const;
