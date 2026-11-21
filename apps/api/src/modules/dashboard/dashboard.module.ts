/**
 * Dashboard: live counts for the municipal control centre.
 */
import type { LightStatus } from '@smart-light/db';
import {
  dashboardSummarySchema,
  successEnvelope,
  type DashboardSummaryDto,
} from '@smart-light/shared';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendData } from '../../lib/http';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';
import { prisma } from '../../lib/prisma';
import { ROLE_GROUPS } from '../../lib/roles';
import { authenticate } from '../../middlewares/authenticate';
import { requireRoles } from '../../middlewares/authorize';
import { getAuth, requireTenantId } from '../auth/auth.context';

type StatusCounts = DashboardSummaryDto['poles'];

function emptyCounts(): StatusCounts {
  return { total: 0, working: 0, fault: 0, offline: 0, unknown: 0 };
}

function addToCounts(counts: StatusCounts, status: LightStatus, count: number): void {
  counts.total += count;
  if (status === 'FAULT') counts.fault += count;
  else if (status === 'OFFLINE') counts.offline += count;
  else if (status === 'UNKNOWN') counts.unknown += count;
  else counts.working += count;
}

// ── Service ──
const dashboardService = {
  async summary(tenantId: string): Promise<DashboardSummaryDto> {
    const [byZoneAndStatus, zones, devices] = await Promise.all([
      prisma.pole.groupBy({
        by: ['zoneId', 'lightStatus'],
        where: { tenantId, assetStatus: 'ACTIVE' },
        _count: { _all: true },
      }),
      prisma.zone.findMany({ where: { tenantId }, orderBy: { code: 'asc' } }),
      prisma.device.groupBy({ by: ['online'], where: { tenantId }, _count: { _all: true } }),
    ]);

    const poles = emptyCounts();
    const perZone = new Map<string, StatusCounts>(zones.map((zone) => [zone.id, emptyCounts()]));
    for (const row of byZoneAndStatus) {
      addToCounts(poles, row.lightStatus, row._count._all);
      const zoneCounts = row.zoneId ? perZone.get(row.zoneId) : undefined;
      if (zoneCounts) {
        addToCounts(zoneCounts, row.lightStatus, row._count._all);
      }
    }

    return {
      poles,
      devices: {
        total: devices.reduce((sum, row) => sum + row._count._all, 0),
        online: devices.find((row) => row.online)?._count._all ?? 0,
      },
      zones: zones.map((zone) => ({
        id: zone.id,
        code: zone.code,
        name: zone.name,
        ...(perZone.get(zone.id) ?? emptyCounts()),
      })),
    };
  },
};

// ── Controller & routes ──
const tenantQuery = z.object({ tenantId: z.uuid().optional() });

export const dashboardRouter = Router();
dashboardRouter.get(
  '/summary',
  authenticate,
  requireRoles(...ROLE_GROUPS.tenantManagers, 'AGENCY_MANAGER'),
  async (req: Request, res: Response) => {
    const tenantId = requireTenantId(getAuth(res), tenantQuery.parse(req.query).tenantId);
    sendData(res, await dashboardService.summary(tenantId));
  },
);

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/summary',
  tags: ['Dashboard'],
  summary: 'Light status totals for the municipality and per zone',
  security: AUTHENTICATED,
  request: { query: tenantQuery },
  responses: {
    200: { description: 'Summary', content: jsonContent(successEnvelope(dashboardSummarySchema)) },
    ...errorResponses(401, 403),
  },
});
