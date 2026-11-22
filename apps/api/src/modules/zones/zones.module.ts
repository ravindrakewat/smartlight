/**
 * Zones: small module — repository, service, controller and routes kept together.
 * Split into separate files if it grows.
 */
import { createZoneSchema, successEnvelope, zoneSchema, type ZoneDto } from '@smart-light/shared';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendData } from '../../lib/http';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';
import { prisma } from '../../lib/prisma';
import { ROLE_GROUPS } from '../../lib/roles';
import { authenticate } from '../../middlewares/authenticate';
import { requireRoles } from '../../middlewares/authorize';
import { recordAudit } from '../audit/audit.service';
import { getAuth, requireTenantId } from '../auth/auth.context';

// ── Repository ──
const zonesRepository = {
  list(tenantId: string) {
    return prisma.zone.findMany({
      where: { tenantId },
      include: { _count: { select: { poles: true } } },
      orderBy: { code: 'asc' },
    });
  },
};

// ── Service ──
const zonesService = {
  async list(tenantId: string): Promise<ZoneDto[]> {
    const zones = await zonesRepository.list(tenantId);
    return zones.map((zone) => ({
      id: zone.id,
      code: zone.code,
      name: zone.name,
      poleCount: zone._count.poles,
      scheduleId: zone.scheduleId,
    }));
  },

  async create(
    tenantId: string,
    input: z.output<typeof createZoneSchema>,
    req: Request,
    userId: string,
  ): Promise<ZoneDto> {
    return prisma.$transaction(async (tx) => {
      const zone = await tx.zone.create({ data: { ...input, tenantId } });
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: userId,
          action: 'zone.create',
          entityType: 'zone',
          entityId: zone.id,
          metadata: input,
          request: req,
        },
        tx,
      );
      return {
        id: zone.id,
        code: zone.code,
        name: zone.name,
        poleCount: 0,
        scheduleId: zone.scheduleId,
      };
    });
  },
};

// ── Controller ──
const tenantQuery = z.object({ tenantId: z.uuid().optional() });

const zonesController = {
  async list(req: Request, res: Response): Promise<void> {
    const tenantId = requireTenantId(getAuth(res), tenantQuery.parse(req.query).tenantId);
    sendData(res, await zonesService.list(tenantId));
  },

  async create(req: Request, res: Response): Promise<void> {
    const auth = getAuth(res);
    const tenantId = requireTenantId(auth, tenantQuery.parse(req.query).tenantId);
    const input = createZoneSchema.parse(req.body);
    sendData(res, await zonesService.create(tenantId, input, req, auth.userId), 201);
  },
};

// ── Routes ──
export const zonesRouter = Router();
zonesRouter.use(authenticate);
zonesRouter.get('/', requireRoles(...ROLE_GROUPS.tenantReaders), zonesController.list);
zonesRouter.post('/', requireRoles(...ROLE_GROUPS.admins), zonesController.create);

registry.registerPath({
  method: 'get',
  path: '/api/v1/zones',
  tags: ['Assets'],
  summary: 'Zones of the municipality with pole counts',
  security: AUTHENTICATED,
  request: { query: tenantQuery },
  responses: {
    200: { description: 'Zones', content: jsonContent(successEnvelope(z.array(zoneSchema))) },
    ...errorResponses(401, 403),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/zones',
  tags: ['Assets'],
  summary: 'Create a zone (MUNICIPAL_ADMIN)',
  security: AUTHENTICATED,
  request: { query: tenantQuery, body: { content: jsonContent(createZoneSchema) } },
  responses: {
    201: { description: 'Created', content: jsonContent(successEnvelope(zoneSchema)) },
    ...errorResponses(400, 401, 403, 409),
  },
});
