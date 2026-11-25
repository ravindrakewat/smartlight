/**
 * Reports for municipal management and audits:
 *   GET /v1/reports/summary?days=30          SLA, repairs, complaints, energy, availability
 *   GET /v1/reports/work-orders.csv?days=30  every work order created in the period (Excel-ready)
 *   GET /v1/reports/breakdown?days=30        trend, faults, wards, technicians, agencies
 */
import {
  reportBreakdownSchema,
  reportQuerySchema,
  reportSummarySchema,
  successEnvelope,
  type ReportSummaryDto,
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
import { reportBreakdown } from './reports.breakdown';

const HOUR_MS = 60 * 60 * 1000;
const OPEN = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_VERIFICATION'] as const;

function periodOf(days: number) {
  const to = new Date();
  return { from: new Date(to.getTime() - days * 24 * HOUR_MS), to };
}

// ── Service ──
const reportsService = {
  async summary(tenantId: string, days: number): Promise<ReportSummaryDto> {
    const { from, to } = periodOf(days);
    const [created, bySource, resolvedJobs, openNow, overdueNow, complaintsIn, complaintsDone] =
      await Promise.all([
        prisma.workOrder.count({ where: { tenantId, createdAt: { gte: from } } }),
        prisma.workOrder.groupBy({
          by: ['source'],
          where: { tenantId, createdAt: { gte: from } },
          _count: { _all: true },
        }),
        prisma.workOrder.findMany({
          where: { tenantId, status: 'RESOLVED', verifiedAt: { gte: from } },
          select: { createdAt: true, completedAt: true, verifiedAt: true, slaDueAt: true },
        }),
        prisma.workOrder.count({ where: { tenantId, status: { in: [...OPEN] } } }),
        prisma.workOrder.count({
          where: { tenantId, status: { in: [...OPEN] }, slaDueAt: { lt: to } },
        }),
        prisma.complaint.count({ where: { tenantId, createdAt: { gte: from } } }),
        prisma.complaint.count({ where: { tenantId, resolvedAt: { gte: from } } }),
      ]);

    let withinSla = 0;
    let repairHours = 0;
    for (const job of resolvedJobs) {
      const finished = job.completedAt ?? job.verifiedAt ?? to;
      if (finished <= job.slaDueAt) withinSla++;
      repairHours += (finished.getTime() - job.createdAt.getTime()) / HOUR_MS;
    }

    // Energy: per controller, the growth of its cumulative counter within the period.
    const energy = await prisma.$queryRaw<{ kwh: number | null; devices: bigint }[]>`
      SELECT COALESCE(SUM(delta), 0) / 1000.0 AS kwh, COUNT(*) AS devices
      FROM (
        SELECT GREATEST(MAX("energyWh") - MIN("energyWh"), 0) AS delta
        FROM "device_readings"
        WHERE "tenantId" = ${tenantId}::uuid AND "receivedAt" >= ${from}
        GROUP BY "deviceId"
      ) per_device`;

    const [poles, working, controllers, online] = await Promise.all([
      prisma.pole.count({ where: { tenantId, assetStatus: 'ACTIVE' } }),
      prisma.pole.count({
        where: { tenantId, assetStatus: 'ACTIVE', lightStatus: { in: ['ON', 'DIMMED', 'OFF'] } },
      }),
      prisma.device.count({ where: { tenantId } }),
      prisma.device.count({ where: { tenantId, online: true } }),
    ]);

    const source = (name: string) => bySource.find((row) => row.source === name)?._count._all ?? 0;
    const resolved = resolvedJobs.length;
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      workOrders: {
        created,
        resolved,
        resolvedWithinSla: withinSla,
        slaCompliance: resolved > 0 ? withinSla / resolved : null,
        averageRepairHours: resolved > 0 ? Math.round((repairHours / resolved) * 10) / 10 : null,
        openNow,
        overdueNow,
        bySource: {
          IOT_ALERT: source('IOT_ALERT'),
          CITIZEN_COMPLAINT: source('CITIZEN_COMPLAINT'),
          INSPECTION: source('INSPECTION'),
          MANUAL: source('MANUAL'),
        },
      },
      complaints: { received: complaintsIn, resolved: complaintsDone },
      energy: {
        kWh: Math.round(Number(energy[0]?.kwh ?? 0) * 10) / 10,
        controllersReporting: Number(energy[0]?.devices ?? 0),
      },
      poles: { total: poles, workingNow: working, controllersOnline: online, controllers },
    };
  },

  async workOrdersCsv(tenantId: string, days: number): Promise<string> {
    const { from } = periodOf(days);
    const rows = await prisma.workOrder.findMany({
      where: { tenantId, createdAt: { gte: from } },
      orderBy: { createdAt: 'asc' },
      include: {
        pole: {
          select: { code: true, address: true, ward: true, zone: { select: { code: true } } },
        },
        technician: { select: { name: true } },
        agency: { select: { name: true } },
      },
    });
    const iso = (date: Date | null) => (date ? date.toISOString() : '');
    const header = [
      'number',
      'pole',
      'zone',
      'ward',
      'address',
      'source',
      'priority',
      'fault',
      'status',
      'created_at',
      'sla_due_at',
      'completed_at',
      'verified_at',
      'within_sla',
      'verification',
      'resolution',
      'technician',
      'agency',
    ];
    const lines = rows.map((row) => {
      const finished = row.completedAt ?? row.verifiedAt;
      const withinSla = row.status === 'RESOLVED' && finished ? finished <= row.slaDueAt : null;
      return [
        row.number,
        row.pole.code,
        row.pole.zone?.code ?? '',
        row.pole.ward ?? '',
        row.pole.address ?? '',
        row.source,
        row.priority,
        row.faultType ?? '',
        row.status,
        iso(row.createdAt),
        iso(row.slaDueAt),
        iso(row.completedAt),
        iso(row.verifiedAt),
        withinSla === null ? '' : withinSla ? 'yes' : 'no',
        row.verificationMethod ?? '',
        row.resolutionCode ?? '',
        row.technician?.name ?? '',
        row.agency?.name ?? '',
      ];
    });
    // Quote every field; neutralise spreadsheet formulas (=, +, -, @ at the start).
    const cell = (value: string) => {
      const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    return [header, ...lines].map((line) => line.map(cell).join(',')).join('\r\n');
  },
};

// ── Controller ──
const reportsController = {
  async summary(req: Request, res: Response): Promise<void> {
    const query = reportQuerySchema.parse(req.query);
    const tenantId = requireTenantId(getAuth(res), query.tenantId);
    sendData(res, await reportsService.summary(tenantId, query.days));
  },
  async breakdown(req: Request, res: Response): Promise<void> {
    const query = reportQuerySchema.parse(req.query);
    const tenantId = requireTenantId(getAuth(res), query.tenantId);
    sendData(res, await reportBreakdown(tenantId, query.days));
  },
  async workOrdersCsv(req: Request, res: Response): Promise<void> {
    const query = reportQuerySchema.parse(req.query);
    const tenantId = requireTenantId(getAuth(res), query.tenantId);
    const csv = await reportsService.workOrdersCsv(tenantId, query.days);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="work-orders-${query.days}d-${stamp}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    // Byte-order mark so Excel opens Hindi text correctly.
    res.send(`${String.fromCharCode(0xfeff)}${csv}`);
  },
};

// ── Routes ──
export const reportsRouter = Router();
reportsRouter.use(authenticate, requireRoles(...ROLE_GROUPS.tenantManagers));
reportsRouter.get('/summary', reportsController.summary);
reportsRouter.get('/work-orders.csv', reportsController.workOrdersCsv);
reportsRouter.get('/breakdown', reportsController.breakdown);

const TAG = 'Reports';
registry.registerPath({
  method: 'get',
  path: '/api/v1/reports/summary',
  tags: [TAG],
  summary: 'SLA compliance, repairs, complaints, energy and availability for a period',
  security: AUTHENTICATED,
  request: { query: reportQuerySchema },
  responses: {
    200: { description: 'Report', content: jsonContent(successEnvelope(reportSummarySchema)) },
    ...errorResponses(400, 401, 403),
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/reports/breakdown',
  tags: [TAG],
  summary: 'Daily or monthly trend, faults, ward, technician and agency tables for a period',
  security: AUTHENTICATED,
  request: { query: reportQuerySchema },
  responses: {
    200: {
      description: 'Report tables',
      content: jsonContent(successEnvelope(reportBreakdownSchema)),
    },
    ...errorResponses(400, 401, 403),
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/reports/work-orders.csv',
  tags: [TAG],
  summary: 'Work orders created in the period as CSV (opens in Excel, Hindi-safe)',
  security: AUTHENTICATED,
  request: { query: reportQuerySchema },
  responses: {
    200: { description: 'CSV file', content: { 'text/csv': { schema: z.string() } } },
    ...errorResponses(400, 401, 403),
  },
});
