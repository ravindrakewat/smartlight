/**
 * Oversight lists:
 *   GET /v1/audit     append-only audit trail (platform admins: every city or one;
 *                     municipal admins: their own city only)
 *   GET /v1/devices   controllers with their pole and connectivity
 */
import type { Prisma } from '@smart-light/db';
import {
  auditEntrySchema,
  deviceListItemSchema,
  listAuditQuerySchema,
  listDevicesQuerySchema,
  paginatedEnvelope,
  type AuditEntryDto,
  type DeviceListItemDto,
} from '@smart-light/shared';
import { Router, type Request, type Response } from 'express';
import { sendPage } from '../../lib/http';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';
import { paginationMeta, toSkipTake } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { ROLE_GROUPS, toIso } from '../../lib/roles';
import { authenticate } from '../../middlewares/authenticate';
import { requireRoles } from '../../middlewares/authorize';
import { getAuth, requireTenantId, type AuthContext } from '../auth/auth.context';

/** Platform admins may look across cities; everyone else is pinned to their own. */
function scopeTenant(auth: AuthContext, requested?: string): string | undefined {
  if (auth.role === 'SUPER_ADMIN') {
    return requested;
  }
  return requireTenantId(auth, requested);
}

// ── Controller ──
const platformController = {
  async audit(req: Request, res: Response): Promise<void> {
    const query = listAuditQuerySchema.parse(req.query);
    const tenantId = scopeTenant(getAuth(res), query.tenantId);
    const where: Prisma.AuditLogWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(query.action ? { action: { startsWith: query.action } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { tenant: { select: { id: true, name: true } } },
        ...toSkipTake(query),
      }),
      prisma.auditLog.count({ where }),
    ]);
    const userIds = [
      ...new Set(
        rows.flatMap((row) => (row.actorType === 'USER' && row.actorId ? [row.actorId] : [])),
      ),
    ];
    const users = new Map(
      (
        await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      ).map((user) => [user.id, user.name]),
    );
    const items: AuditEntryDto[] = rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      action: row.action,
      actorType: row.actorType,
      actor:
        row.actorType === 'USER' && row.actorId
          ? (users.get(row.actorId) ?? null)
          : row.actorType === 'DEVICE'
            ? row.actorId
            : null,
      entityType: row.entityType,
      entityId: row.entityId,
      ip: row.ip,
      tenant: row.tenant,
      metadata: row.metadata ?? null,
    }));
    sendPage(res, items, paginationMeta(query, total));
  },

  async devices(req: Request, res: Response): Promise<void> {
    const query = listDevicesQuerySchema.parse(req.query);
    const tenantId = scopeTenant(getAuth(res), query.tenantId);
    const where: Prisma.DeviceWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(query.online !== undefined ? { online: query.online } : {}),
      ...(query.search
        ? {
            OR: [
              { deviceId: { contains: query.search.toLowerCase() } },
              { pole: { code: { contains: query.search.toUpperCase() } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.device.findMany({
        where,
        orderBy: [{ online: 'asc' }, { deviceId: 'asc' }],
        include: {
          tenant: { select: { id: true, name: true, code: true } },
          pole: { select: { id: true, code: true } },
        },
        ...toSkipTake(query),
      }),
      prisma.device.count({ where }),
    ]);
    const items: DeviceListItemDto[] = rows.map((row) => ({
      id: row.id,
      deviceId: row.deviceId,
      tenant: row.tenant,
      pole: row.pole,
      online: row.online,
      lastSeenAt: toIso(row.lastSeenAt),
      firmwareVersion: row.firmwareVersion,
      mode: row.mode,
      lampOn: row.lampOn,
    }));
    sendPage(res, items, paginationMeta(query, total));
  },
};

// ── Routes ──
/** Mounted at /v1/audit */
export const auditRouter = Router();
auditRouter.get('/', authenticate, requireRoles(...ROLE_GROUPS.admins), platformController.audit);

/** Mounted at /v1/devices (alongside commissioning). */
export const deviceListRouter = Router();
deviceListRouter.get(
  '/',
  authenticate,
  requireRoles(...ROLE_GROUPS.tenantManagers),
  platformController.devices,
);

registry.registerPath({
  method: 'get',
  path: '/api/v1/audit',
  tags: ['Platform'],
  summary: 'Audit trail (newest first); municipal admins see their own city only',
  security: AUTHENTICATED,
  request: { query: listAuditQuerySchema },
  responses: {
    200: { description: 'Entries', content: jsonContent(paginatedEnvelope(auditEntrySchema)) },
    ...errorResponses(400, 401, 403),
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/devices',
  tags: ['Platform'],
  summary: 'Street-light controllers with pole and connectivity (offline first)',
  security: AUTHENTICATED,
  request: { query: listDevicesQuerySchema },
  responses: {
    200: {
      description: 'Controllers',
      content: jsonContent(paginatedEnvelope(deviceListItemSchema)),
    },
    ...errorResponses(400, 401, 403),
  },
});
