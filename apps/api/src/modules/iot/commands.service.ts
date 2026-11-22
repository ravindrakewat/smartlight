/**
 * Queues controller commands in the outbox (device_commands). The MQTT bridge
 * (src/iot/mqtt-bridge.ts) publishes them and records acknowledgements, so the
 * API never talks to the broker and a broker outage never fails a request.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@smart-light/db';
import {
  TECHNICIAN_TEST_MAX_MINUTES,
  validDeviceCommandSchema,
  type ControlResultDto,
  type DeviceCommand,
  type lightingCommandRequestSchema,
  type ScheduleStep,
} from '@smart-light/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import { prisma, type DbClient } from '../../lib/prisma';
import { errors } from '../../utils/errors';
import { recordAudit } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.context';

/** A live override that is not delivered within 10 minutes is no longer wanted. */
const OUTPUT_COMMAND_TTL_S = 10 * 60;
/** A schedule stays valid for a controller that comes back online within a week. */
const SCHEDULE_COMMAND_TTL_S = 7 * 24 * 60 * 60;

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Identifies one version of a schedule on the wire (`<uuid>@<updatedAt base 36>`),
 * so the console can tell whether a controller runs the latest plan.
 */
export function scheduleVersionId(schedule: { id: string; updatedAt: Date }): string {
  return `${schedule.id}@${Math.floor(schedule.updatedAt.getTime() / 1000).toString(36)}`;
}

/** UTC offset of a time zone in minutes (IST → 330), via the platform's time-zone data. */
export function utcOffsetMinutes(timeZone: string, at = new Date()): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? '');
  if (!match) {
    return 0;
  }
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

type CommandBody = DistributiveOmit<DeviceCommand, 'v' | 'cmdId' | 'issuedAt' | 'expiresAt'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Builds, validates and stores one command for one controller. */
async function queueCommand(
  db: DbClient,
  device: { id: string; tenantId: string },
  body: CommandBody,
  ttlSeconds: number,
  createdById: string | null,
): Promise<string> {
  const id = randomUUID();
  const issuedAt = nowSeconds();
  const payload = validDeviceCommandSchema.parse({
    v: 1,
    cmdId: id,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds,
    ...body,
  });
  await db.deviceCommand.create({
    data: {
      id,
      tenantId: device.tenantId,
      deviceId: device.id,
      action: payload.action,
      payload: payload as Prisma.InputJsonValue,
      createdById,
      expiresAt: new Date((issuedAt + ttlSeconds) * 1000),
    },
  });
  return id;
}

/** Poles (with their controller, if any) addressed by a control request. */
async function resolveTargets(
  tenantId: string,
  target: z.output<typeof lightingCommandRequestSchema>['target'],
) {
  const where: Prisma.PoleWhereInput = { tenantId, assetStatus: 'ACTIVE' };
  if (target.type === 'pole') {
    where.id = target.poleId;
  } else if (target.type === 'zone') {
    where.zoneId = target.zoneId;
    if (!(await prisma.zone.findFirst({ where: { id: target.zoneId, tenantId } }))) {
      throw errors.notFound('Zone');
    }
  }
  const poles = await prisma.pole.findMany({
    where,
    select: { id: true, device: { select: { id: true, tenantId: true } } },
  });
  if (target.type === 'pole' && poles.length === 0) {
    throw errors.notFound('Pole');
  }
  return poles;
}

/** Technicians may only test the lamp of a pole they are working on, briefly. */
async function assertTechnicianMayTest(
  auth: AuthContext,
  input: z.output<typeof lightingCommandRequestSchema>,
): Promise<void> {
  if (auth.role !== 'TECHNICIAN') {
    return;
  }
  const { target, control } = input;
  const brief = control.action === 'auto' || control.durationMinutes <= TECHNICIAN_TEST_MAX_MINUTES;
  const job =
    target.type === 'pole'
      ? await prisma.workOrder.findFirst({
          where: {
            poleId: target.poleId,
            assignedTechnicianId: auth.userId,
            status: { in: ['ASSIGNED', 'IN_PROGRESS', 'PENDING_VERIFICATION'] },
          },
          select: { id: true },
        })
      : null;
  if (!brief || !job) {
    throw errors.forbidden('Technicians can only briefly test a pole from their own job');
  }
}

export const commandsService = {
  /** Switches one pole, a zone or the whole city (manual override or back to schedule). */
  async control(
    tenantId: string,
    input: z.output<typeof lightingCommandRequestSchema>,
    auth: AuthContext,
    request: Request,
  ): Promise<ControlResultDto> {
    await assertTechnicianMayTest(auth, input);
    const poles = await resolveTargets(tenantId, input.target);
    const devices = poles.flatMap((pole) => (pole.device ? [pole.device] : []));
    const { control } = input;

    const body: CommandBody =
      control.action === 'auto'
        ? { action: 'set_auto' }
        : {
            action: 'set_output',
            on: control.action === 'on',
            dimPercent: control.action === 'on' ? control.dimPercent : 0,
            overrideUntil: nowSeconds() + control.durationMinutes * 60,
          };

    await prisma.$transaction(async (tx) => {
      for (const device of devices) {
        await queueCommand(tx, device, body, OUTPUT_COMMAND_TTL_S, auth.userId);
      }
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: auth.userId,
          action: 'lighting.control',
          entityType: input.target.type === 'pole' ? 'pole' : input.target.type,
          entityId:
            input.target.type === 'pole'
              ? input.target.poleId
              : input.target.type === 'zone'
                ? input.target.zoneId
                : tenantId,
          metadata: { control, controllers: devices.length },
          request,
        },
        tx,
      );
    });
    return { queued: devices.length, withoutController: poles.length - devices.length };
  },

  /**
   * Sends every affected controller the schedule that now applies to it (its zone's
   * schedule, else the city default). Older undelivered schedule commands are
   * superseded so a controller never receives an outdated plan after a newer one.
   */
  async syncSchedules(
    db: DbClient,
    tenantId: string,
    scope: { zoneIds?: string[]; deviceIds?: string[] } = {},
    createdById: string | null = null,
  ): Promise<number> {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const fallback = await db.schedule.findFirst({ where: { tenantId, isDefault: true } });
    const devices = await db.device.findMany({
      where: {
        tenantId,
        poleId: { not: null },
        ...(scope.deviceIds ? { id: { in: scope.deviceIds } } : {}),
        ...(scope.zoneIds ? { pole: { zoneId: { in: scope.zoneIds } } } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        pole: {
          select: {
            latitude: true,
            longitude: true,
            zone: { select: { schedule: true } },
          },
        },
      },
    });

    let queued = 0;
    for (const device of devices) {
      const schedule = device.pole?.zone?.schedule ?? fallback;
      if (!schedule || !device.pole) {
        continue;
      }
      await db.deviceCommand.updateMany({
        where: { deviceId: device.id, action: 'set_schedule', status: { in: ['PENDING', 'SENT'] } },
        data: { status: 'EXPIRED', reason: 'Superseded by a newer schedule' },
      });
      await queueCommand(
        db,
        device,
        {
          action: 'set_schedule',
          scheduleId: scheduleVersionId(schedule),
          utcOffsetMinutes: utcOffsetMinutes(tenant.timezone),
          location: { latitude: device.pole.latitude, longitude: device.pole.longitude },
          steps: schedule.steps as ScheduleStep[],
        },
        SCHEDULE_COMMAND_TTL_S,
        createdById,
      );
      queued++;
    }
    return queued;
  },
};
