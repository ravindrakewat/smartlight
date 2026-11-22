/**
 * Lighting operations for the console and the technician app:
 *   POST /v1/lighting/commands      switch a pole, a zone or the city
 *   GET  /v1/poles/:id/live         controller state, 24 h power, events, commands
 *   GET  /v1/alerts                 controller faults (open by default)
 *   POST /v1/alerts/:id/resolve     operator closes a warning by hand
 */
import {
  controlResultSchema,
  deviceEventDtoSchema,
  lightingCommandRequestSchema,
  listDeviceEventsQuerySchema,
  paginatedEnvelope,
  poleLiveSchema,
  successEnvelope,
  type PoleLiveDto,
} from '@smart-light/shared';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendData, sendPage } from '../../lib/http';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';
import { paginationMeta, toSkipTake } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { ROLE_GROUPS, toIso } from '../../lib/roles';
import { authenticate } from '../../middlewares/authenticate';
import { requireRoles } from '../../middlewares/authorize';
import { errors } from '../../utils/errors';
import { recordAudit } from '../audit/audit.service';
import { getAuth, requireTenantId } from '../auth/auth.context';
import { commandsService, scheduleVersionId } from './commands.service';
import { eventInclude, toCommandDto, toEventDto } from './iot.mappers';

const READINGS_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_CHART_POINTS = 288;

// ── Service ──
const lightingService = {
  async live(tenantId: string, poleId: string): Promise<PoleLiveDto> {
    const pole = await prisma.pole.findFirst({
      where: { id: poleId, tenantId },
      select: {
        id: true,
        zone: { select: { schedule: { select: { id: true, name: true, updatedAt: true } } } },
        device: true,
      },
    });
    if (!pole) {
      throw errors.notFound('Pole');
    }
    const fallback = await prisma.schedule.findFirst({
      where: { tenantId, isDefault: true },
      select: { id: true, name: true, updatedAt: true },
    });
    const schedule = pole.zone?.schedule ?? fallback;
    const device = pole.device;

    const [readings, events, commands] = device
      ? await Promise.all([
          prisma.deviceReading.findMany({
            where: {
              deviceId: device.id,
              receivedAt: { gte: new Date(Date.now() - READINGS_WINDOW_MS) },
            },
            orderBy: { receivedAt: 'asc' },
            select: {
              receivedAt: true,
              powerW: true,
              voltageV: true,
              lampOn: true,
              dimPercent: true,
            },
          }),
          prisma.deviceEvent.findMany({
            where: { deviceId: device.id },
            orderBy: { receivedAt: 'desc' },
            take: 20,
            include: eventInclude,
          }),
          prisma.deviceCommand.findMany({
            where: { deviceId: device.id },
            orderBy: { createdAt: 'desc' },
            take: 20,
          }),
        ])
      : [[], [], []];

    const creatorIds = [
      ...new Set(commands.flatMap((c) => (c.createdById ? [c.createdById] : []))),
    ];
    const creators = new Map(
      (
        await prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true },
        })
      ).map((user) => [user.id, user]),
    );

    // Keep charts light: at most one point per 5 minutes over 24 h.
    const step = Math.max(1, Math.ceil(readings.length / MAX_CHART_POINTS));
    const telemetry = device?.lastTelemetry as
      | {
          electrical?: { voltageV?: number; currentA?: number; powerW?: number; energyWh?: number };
          device?: { rssiDbm?: number; network?: string; boardTempC?: number };
        }
      | null
      | undefined;

    return {
      device: device
        ? {
            deviceId: device.deviceId,
            online: device.online,
            lastSeenAt: toIso(device.lastSeenAt),
            firmwareVersion: device.firmwareVersion,
            lampOn: device.lampOn,
            dimPercent: device.dimPercent,
            mode: device.mode,
            lastTelemetryAt: toIso(device.lastTelemetryAt),
            voltageV: telemetry?.electrical?.voltageV ?? null,
            currentA: telemetry?.electrical?.currentA ?? null,
            powerW: telemetry?.electrical?.powerW ?? null,
            energyWh: telemetry?.electrical?.energyWh ?? null,
            rssiDbm: telemetry?.device?.rssiDbm ?? null,
            network: telemetry?.device?.network ?? null,
            boardTempC: telemetry?.device?.boardTempC ?? null,
            scheduleInSync: schedule
              ? device.appliedScheduleId === scheduleVersionId(schedule)
              : true,
          }
        : null,
      readings: readings
        .filter((_, index) => index % step === 0)
        .map((reading) => ({
          at: reading.receivedAt.toISOString(),
          powerW: reading.powerW,
          voltageV: reading.voltageV,
          lampOn: reading.lampOn,
          dimPercent: reading.dimPercent,
        })),
      events: events.map(toEventDto),
      commands: commands.map((command) =>
        toCommandDto({
          ...command,
          createdBy: command.createdById ? (creators.get(command.createdById) ?? null) : null,
        }),
      ),
      schedule: schedule
        ? { id: schedule.id, name: schedule.name, fromZone: Boolean(pole.zone?.schedule) }
        : null,
    };
  },

  async alerts(tenantId: string, query: z.output<typeof listDeviceEventsQuerySchema>) {
    const where = {
      tenantId,
      // Boot and "cleared" notices are history, not alerts.
      type: { notIn: ['boot', 'fault_cleared'] },
      ...(query.open ? { resolvedAt: null } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.poleId ? { poleId: query.poleId } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.deviceEvent.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        include: eventInclude,
        ...toSkipTake(query),
      }),
      prisma.deviceEvent.count({ where }),
    ]);
    return { items: rows.map(toEventDto), pagination: paginationMeta(query, total) };
  },

  async resolveAlert(tenantId: string, id: string, userId: string, request: Request) {
    return prisma.$transaction(async (tx) => {
      const event = await tx.deviceEvent.findFirst({ where: { id, tenantId } });
      if (!event) {
        throw errors.notFound('Alert');
      }
      const updated = await tx.deviceEvent.update({
        where: { id },
        data: { resolvedAt: event.resolvedAt ?? new Date() },
        include: eventInclude,
      });
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: userId,
          action: 'alert.resolve',
          entityType: 'device_event',
          entityId: id,
          request,
        },
        tx,
      );
      return toEventDto(updated);
    });
  },
};

// ── Controller ──
const tenantQuery = z.object({ tenantId: z.uuid().optional() });
const idParams = z.object({ id: z.uuid() });
const tenantOf = (req: Request, res: Response) =>
  requireTenantId(getAuth(res), tenantQuery.parse(req.query).tenantId);

const lightingController = {
  async command(req: Request, res: Response): Promise<void> {
    const input = lightingCommandRequestSchema.parse(req.body);
    const result = await commandsService.control(tenantOf(req, res), input, getAuth(res), req);
    sendData(res, result, 202);
  },
  async live(req: Request, res: Response): Promise<void> {
    const { id } = idParams.parse(req.params);
    sendData(res, await lightingService.live(tenantOf(req, res), id));
  },
  async alerts(req: Request, res: Response): Promise<void> {
    const query = listDeviceEventsQuerySchema.parse(req.query);
    const tenantId = requireTenantId(getAuth(res), query.tenantId);
    const { items, pagination } = await lightingService.alerts(tenantId, query);
    sendPage(res, items, pagination);
  },
  async resolveAlert(req: Request, res: Response): Promise<void> {
    const { id } = idParams.parse(req.params);
    sendData(
      res,
      await lightingService.resolveAlert(tenantOf(req, res), id, getAuth(res).userId, req),
    );
  },
};

// ── Routes ──
/** Mounted at /v1/lighting */
export const lightingRouter = Router();
lightingRouter.use(authenticate);
lightingRouter.post(
  '/commands',
  requireRoles(...ROLE_GROUPS.tenantManagers, 'TECHNICIAN'),
  lightingController.command,
);

/** Mounted at /v1/poles (live view of one pole). */
export const poleLiveRouter = Router();
poleLiveRouter.get(
  '/:id/live',
  authenticate,
  requireRoles(...ROLE_GROUPS.tenantReaders),
  lightingController.live,
);

/** Mounted at /v1/alerts */
export const alertsRouter = Router();
alertsRouter.use(authenticate);
alertsRouter.get('/', requireRoles(...ROLE_GROUPS.tenantReaders), lightingController.alerts);
alertsRouter.post(
  '/:id/resolve',
  requireRoles(...ROLE_GROUPS.tenantManagers),
  lightingController.resolveAlert,
);

const TAG = 'Lighting';

registry.registerPath({
  method: 'post',
  path: '/api/v1/lighting/commands',
  tags: [TAG],
  summary: 'Switch a pole, a zone or the whole city (override for a while, or back to schedule)',
  description:
    'Queues one command per controller; the MQTT bridge delivers it and records the acknowledgement. Technicians may only test a pole from their own job for up to 15 minutes.',
  security: AUTHENTICATED,
  request: { query: tenantQuery, body: { content: jsonContent(lightingCommandRequestSchema) } },
  responses: {
    202: { description: 'Queued', content: jsonContent(successEnvelope(controlResultSchema)) },
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/poles/{id}/live',
  tags: [TAG],
  summary: 'Live controller state, last 24 h of power, recent events and commands',
  security: AUTHENTICATED,
  request: { params: idParams, query: tenantQuery },
  responses: {
    200: { description: 'Live state', content: jsonContent(successEnvelope(poleLiveSchema)) },
    ...errorResponses(401, 403, 404),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/alerts',
  tags: [TAG],
  summary: 'Controller faults and warnings (open ones by default)',
  security: AUTHENTICATED,
  request: { query: listDeviceEventsQuerySchema },
  responses: {
    200: { description: 'Alerts', content: jsonContent(paginatedEnvelope(deviceEventDtoSchema)) },
    ...errorResponses(400, 401, 403),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/alerts/{id}/resolve',
  tags: [TAG],
  summary: 'Mark an alert as handled',
  security: AUTHENTICATED,
  request: { params: idParams, query: tenantQuery },
  responses: {
    200: { description: 'Resolved', content: jsonContent(successEnvelope(deviceEventDtoSchema)) },
    ...errorResponses(401, 403, 404),
  },
});
