/**
 * Dashboard: live counts for the municipal control centre.
 */
import { Prisma, type LightStatus } from '@smart-light/db';
import {
  dashboardActivityQuerySchema,
  dashboardActivitySchema,
  dashboardSummarySchema,
  successEnvelope,
  type DashboardActivityDto,
  type DashboardRange,
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
  return { total: 0, working: 0, on: 0, dimmed: 0, off: 0, fault: 0, offline: 0, unknown: 0 };
}

function addToCounts(counts: StatusCounts, status: LightStatus, count: number): void {
  counts.total += count;
  if (status === 'FAULT') counts.fault += count;
  else if (status === 'OFFLINE') counts.offline += count;
  else if (status === 'UNKNOWN') counts.unknown += count;
  else {
    counts.working += count;
    if (status === 'ON') counts.on += count;
    else if (status === 'DIMMED') counts.dimmed += count;
    else counts.off += count;
  }
}

/** Readings older than this do not count towards the current load. */
const LOAD_WINDOW_MINUTES = 15;

// ── Service ──
const dashboardService = {
  async summary(tenantId: string): Promise<DashboardSummaryDto> {
    const [byZoneAndStatus, zones, devices, load] = await Promise.all([
      prisma.pole.groupBy({
        by: ['zoneId', 'lightStatus'],
        where: { tenantId, assetStatus: 'ACTIVE' },
        _count: { _all: true },
      }),
      prisma.zone.findMany({ where: { tenantId }, orderBy: { code: 'asc' } }),
      prisma.device.groupBy({ by: ['online'], where: { tenantId }, _count: { _all: true } }),
      prisma.$queryRaw<{ watts: number; reporting: number }[]>(Prisma.sql`
        SELECT coalesce(sum(("lastTelemetry" -> 'electrical' ->> 'powerW')::float8), 0)::float8 AS watts,
               count(*)::int AS reporting
          FROM devices
         WHERE "tenantId" = ${tenantId}::uuid
           AND online
           AND "lastTelemetryAt" > now() - make_interval(mins => ${LOAD_WINDOW_MINUTES})
           AND jsonb_typeof("lastTelemetry" -> 'electrical' -> 'powerW') = 'number'`),
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
      power: {
        currentW: Math.round((load[0]?.watts ?? 0) * 10) / 10,
        reporting: load[0]?.reporting ?? 0,
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

const RANGES: Record<DashboardRange, { bucket: 'hour' | 'day'; steps: number }> = {
  '24h': { bucket: 'hour', steps: 24 },
  '7d': { bucket: 'day', steps: 7 },
  '30d': { bucket: 'day', steps: 30 },
};

interface ActivityRow {
  at: Date;
  reporting: number;
  lit: number;
  faults: number;
}

const activityService = {
  /** Buckets in the city's time zone, oldest first, including empty ones. */
  async activity(tenantId: string, range: DashboardRange): Promise<DashboardActivityDto> {
    const { bucket, steps } = RANGES[range];
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const zone = tenant.timezone;
    const unit = Prisma.raw(`'${bucket}'`);
    const step = Prisma.raw(`interval '1 ${bucket}'`);
    const span = Prisma.raw(`interval '${steps - 1} ${bucket}'`);
    const rows = await prisma.$queryRaw<ActivityRow[]>`
      WITH series AS (
        SELECT generate_series(
          date_trunc(${unit}, now() AT TIME ZONE ${zone}) - ${span},
          date_trunc(${unit}, now() AT TIME ZONE ${zone}),
          ${step}
        ) AS local_at
      ),
      readings AS (
        SELECT date_trunc(${unit}, r."receivedAt" AT TIME ZONE ${zone}) AS local_at,
               count(DISTINCT r."deviceId")::int AS reporting,
               count(DISTINCT r."deviceId") FILTER (WHERE r."lampOn")::int AS lit
        FROM "device_readings" r
        WHERE r."tenantId" = ${tenantId}::uuid
          AND r."receivedAt" >= (SELECT min(local_at) FROM series) AT TIME ZONE ${zone}
        GROUP BY 1
      ),
      faults AS (
        SELECT date_trunc(${unit}, e."receivedAt" AT TIME ZONE ${zone}) AS local_at,
               count(*)::int AS faults
        FROM "device_events" e
        WHERE e."tenantId" = ${tenantId}::uuid
          AND e."severity" IN ('warning', 'critical')
          AND e."type" NOT IN ('boot', 'fault_cleared')
          AND e."receivedAt" >= (SELECT min(local_at) FROM series) AT TIME ZONE ${zone}
        GROUP BY 1
      )
      SELECT s.local_at AT TIME ZONE ${zone} AS at,
             coalesce(r.reporting, 0) AS reporting,
             coalesce(r.lit, 0) AS lit,
             coalesce(f.faults, 0) AS faults
      FROM series s
      LEFT JOIN readings r ON r.local_at = s.local_at
      LEFT JOIN faults f ON f.local_at = s.local_at
      ORDER BY s.local_at`;
    return {
      range,
      bucket,
      points: rows.map((row) => ({
        at: row.at.toISOString(),
        reporting: row.reporting,
        lit: row.lit,
        faults: row.faults,
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

dashboardRouter.get(
  '/activity',
  authenticate,
  requireRoles(...ROLE_GROUPS.tenantManagers, 'AGENCY_MANAGER'),
  async (req: Request, res: Response) => {
    const query = dashboardActivityQuerySchema.parse(req.query);
    const tenantId = requireTenantId(getAuth(res), query.tenantId);
    sendData(res, await activityService.activity(tenantId, query.range));
  },
);

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/activity',
  tags: ['Dashboard'],
  summary: 'Controllers reporting, lamps lit and new faults over time',
  security: AUTHENTICATED,
  request: { query: dashboardActivityQuerySchema },
  responses: {
    200: {
      description: 'History',
      content: jsonContent(successEnvelope(dashboardActivitySchema)),
    },
    ...errorResponses(400, 401, 403),
  },
});
