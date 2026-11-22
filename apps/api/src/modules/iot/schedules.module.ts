/**
 * Lighting schedules. A zone uses its own schedule or, if it has none, the city's
 * default schedule. Every change is pushed to the affected controllers, which
 * keep the plan in flash and run it without connectivity.
 *
 *   GET    /v1/schedules              list (with zones using each)
 *   POST   /v1/schedules              create
 *   PUT    /v1/schedules/:id          replace name/steps/default flag
 *   DELETE /v1/schedules/:id          delete (zones fall back to the default)
 *   PUT    /v1/zones/:id/schedule     assign a schedule to a zone (or null)
 */
import type { Prisma } from '@smart-light/db';
import {
  assignZoneScheduleSchema,
  saveScheduleSchema,
  scheduleDtoSchema,
  successEnvelope,
  type ScheduleDto,
} from '@smart-light/shared';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendData } from '../../lib/http';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';
import { prisma, type DbClient } from '../../lib/prisma';
import { ROLE_GROUPS } from '../../lib/roles';
import { authenticate } from '../../middlewares/authenticate';
import { requireRoles } from '../../middlewares/authorize';
import { errors } from '../../utils/errors';
import { recordAudit } from '../audit/audit.service';
import { getAuth, requireTenantId } from '../auth/auth.context';
import { commandsService } from './commands.service';
import { toScheduleDto } from './iot.mappers';

const scheduleInclude = {
  zones: { select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } },
} as const;

/** Steps in time order (clock steps by minute; solar steps keep their given order). */
function sortedSteps(steps: z.output<typeof saveScheduleSchema>['steps']) {
  return [...steps].sort((a, b) =>
    a.anchor === 'clock' && b.anchor === 'clock' ? a.atMinute - b.atMinute : 0,
  );
}

async function clearOtherDefaults(db: DbClient, tenantId: string, keepId: string): Promise<void> {
  await db.schedule.updateMany({
    where: { tenantId, isDefault: true, NOT: { id: keepId } },
    data: { isDefault: false },
  });
}

// ── Service ──
const schedulesService = {
  async list(tenantId: string): Promise<ScheduleDto[]> {
    const schedules = await prisma.schedule.findMany({
      where: { tenantId },
      include: scheduleInclude,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return schedules.map(toScheduleDto);
  },

  async create(
    tenantId: string,
    input: z.output<typeof saveScheduleSchema>,
    userId: string,
    request: Request,
  ): Promise<ScheduleDto> {
    return prisma.$transaction(async (tx) => {
      const schedule = await tx.schedule.create({
        data: {
          tenantId,
          name: input.name,
          steps: sortedSteps(input.steps) as Prisma.InputJsonValue,
          isDefault: input.isDefault,
        },
        include: scheduleInclude,
      });
      if (input.isDefault) {
        await clearOtherDefaults(tx, tenantId, schedule.id);
        // Poles whose zone has no schedule now follow this one.
        await commandsService.syncSchedules(tx, tenantId, {}, userId);
      }
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: userId,
          action: 'schedule.create',
          entityType: 'schedule',
          entityId: schedule.id,
          metadata: { name: input.name, isDefault: input.isDefault },
          request,
        },
        tx,
      );
      return toScheduleDto(schedule);
    });
  },

  async update(
    tenantId: string,
    id: string,
    input: z.output<typeof saveScheduleSchema>,
    userId: string,
    request: Request,
  ): Promise<ScheduleDto> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.schedule.findFirst({ where: { id, tenantId } });
      if (!existing) {
        throw errors.notFound('Schedule');
      }
      const schedule = await tx.schedule.update({
        where: { id },
        data: {
          name: input.name,
          steps: sortedSteps(input.steps) as Prisma.InputJsonValue,
          isDefault: input.isDefault,
        },
        include: scheduleInclude,
      });
      if (input.isDefault) {
        await clearOtherDefaults(tx, tenantId, id);
      }
      // Simplest correct rule: any schedule change re-sends what applies to everyone.
      const queued = await commandsService.syncSchedules(tx, tenantId, {}, userId);
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: userId,
          action: 'schedule.update',
          entityType: 'schedule',
          entityId: id,
          metadata: { name: input.name, isDefault: input.isDefault, controllers: queued },
          request,
        },
        tx,
      );
      return toScheduleDto(schedule);
    });
  },

  async remove(tenantId: string, id: string, userId: string, request: Request): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.schedule.findFirst({
        where: { id, tenantId },
        include: { zones: { select: { id: true } } },
      });
      if (!existing) {
        throw errors.notFound('Schedule');
      }
      if (existing.isDefault) {
        throw errors.conflict(
          'DEFAULT_SCHEDULE',
          'Make another schedule the default before deleting this one',
        );
      }
      await tx.schedule.delete({ where: { id } });
      const zoneIds = existing.zones.map((zone) => zone.id);
      if (zoneIds.length > 0) {
        await commandsService.syncSchedules(tx, tenantId, { zoneIds }, userId);
      }
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: userId,
          action: 'schedule.delete',
          entityType: 'schedule',
          entityId: id,
          metadata: { name: existing.name },
          request,
        },
        tx,
      );
    });
  },

  async assignToZone(
    tenantId: string,
    zoneId: string,
    scheduleId: string | null,
    userId: string,
    request: Request,
  ): Promise<{ queued: number }> {
    return prisma.$transaction(async (tx) => {
      const zone = await tx.zone.findFirst({ where: { id: zoneId, tenantId } });
      if (!zone) {
        throw errors.notFound('Zone');
      }
      if (scheduleId && !(await tx.schedule.findFirst({ where: { id: scheduleId, tenantId } }))) {
        throw errors.notFound('Schedule');
      }
      await tx.zone.update({ where: { id: zoneId }, data: { scheduleId } });
      const queued = await commandsService.syncSchedules(
        tx,
        tenantId,
        { zoneIds: [zoneId] },
        userId,
      );
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: userId,
          action: 'zone.assign_schedule',
          entityType: 'zone',
          entityId: zoneId,
          metadata: { scheduleId, controllers: queued },
          request,
        },
        tx,
      );
      return { queued };
    });
  },
};

// ── Controller ──
const tenantQuery = z.object({ tenantId: z.uuid().optional() });
const idParams = z.object({ id: z.uuid() });
const tenantOf = (req: Request, res: Response) =>
  requireTenantId(getAuth(res), tenantQuery.parse(req.query).tenantId);

const schedulesController = {
  async list(req: Request, res: Response): Promise<void> {
    sendData(res, await schedulesService.list(tenantOf(req, res)));
  },
  async create(req: Request, res: Response): Promise<void> {
    const input = saveScheduleSchema.parse(req.body);
    sendData(
      res,
      await schedulesService.create(tenantOf(req, res), input, getAuth(res).userId, req),
      201,
    );
  },
  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParams.parse(req.params);
    const input = saveScheduleSchema.parse(req.body);
    sendData(
      res,
      await schedulesService.update(tenantOf(req, res), id, input, getAuth(res).userId, req),
    );
  },
  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParams.parse(req.params);
    await schedulesService.remove(tenantOf(req, res), id, getAuth(res).userId, req);
    res.status(204).end();
  },
  async assignToZone(req: Request, res: Response): Promise<void> {
    const { id } = idParams.parse(req.params);
    const { scheduleId } = assignZoneScheduleSchema.parse(req.body);
    sendData(
      res,
      await schedulesService.assignToZone(
        tenantOf(req, res),
        id,
        scheduleId,
        getAuth(res).userId,
        req,
      ),
    );
  },
};

// ── Routes ──
export const schedulesRouter = Router();
schedulesRouter.use(authenticate);
schedulesRouter.get('/', requireRoles(...ROLE_GROUPS.tenantReaders), schedulesController.list);
schedulesRouter.post('/', requireRoles(...ROLE_GROUPS.admins), schedulesController.create);
schedulesRouter.put('/:id', requireRoles(...ROLE_GROUPS.admins), schedulesController.update);
schedulesRouter.delete('/:id', requireRoles(...ROLE_GROUPS.admins), schedulesController.remove);

/** Mounted at /v1/zones */
export const zoneScheduleRouter = Router();
zoneScheduleRouter.put(
  '/:id/schedule',
  authenticate,
  requireRoles(...ROLE_GROUPS.admins),
  schedulesController.assignToZone,
);

const TAG = 'Lighting';
registry.registerPath({
  method: 'get',
  path: '/api/v1/schedules',
  tags: [TAG],
  summary: 'Lighting schedules of the city',
  security: AUTHENTICATED,
  request: { query: tenantQuery },
  responses: {
    200: {
      description: 'Schedules',
      content: jsonContent(successEnvelope(z.array(scheduleDtoSchema))),
    },
    ...errorResponses(401, 403),
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/schedules',
  tags: [TAG],
  summary: 'Create a schedule (clock times or offsets from sunset/sunrise)',
  security: AUTHENTICATED,
  request: { query: tenantQuery, body: { content: jsonContent(saveScheduleSchema) } },
  responses: {
    201: { description: 'Created', content: jsonContent(successEnvelope(scheduleDtoSchema)) },
    ...errorResponses(400, 401, 403, 409),
  },
});
registry.registerPath({
  method: 'put',
  path: '/api/v1/schedules/{id}',
  tags: [TAG],
  summary: 'Update a schedule and push it to every controller that uses it',
  security: AUTHENTICATED,
  request: {
    params: idParams,
    query: tenantQuery,
    body: { content: jsonContent(saveScheduleSchema) },
  },
  responses: {
    200: { description: 'Updated', content: jsonContent(successEnvelope(scheduleDtoSchema)) },
    ...errorResponses(400, 401, 403, 404, 409),
  },
});
registry.registerPath({
  method: 'delete',
  path: '/api/v1/schedules/{id}',
  tags: [TAG],
  summary: 'Delete a schedule (its zones fall back to the city default)',
  security: AUTHENTICATED,
  request: { params: idParams, query: tenantQuery },
  responses: { 204: { description: 'Deleted' }, ...errorResponses(401, 403, 404, 409) },
});
registry.registerPath({
  method: 'put',
  path: '/api/v1/zones/{id}/schedule',
  tags: [TAG],
  summary: "Assign a schedule to a zone (null = use the city's default)",
  security: AUTHENTICATED,
  request: {
    params: idParams,
    query: tenantQuery,
    body: { content: jsonContent(assignZoneScheduleSchema) },
  },
  responses: {
    200: {
      description: 'Assigned; controllers queued',
      content: jsonContent(successEnvelope(z.object({ queued: z.number().int() }))),
    },
    ...errorResponses(400, 401, 403, 404),
  },
});
