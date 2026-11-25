/**
 * Detailed report tables: trend, faults, wards, technicians, agencies.
 * Uses the same rules as the summary: a job is "resolved in the period" when it
 * was verified in the period; its repair time runs from creation to completion.
 */
import { Prisma } from '@smart-light/db';
import type { ReportBreakdownDto } from '@smart-light/shared';
import { prisma } from '../../lib/prisma';

const DAY_MS = 24 * 60 * 60 * 1000;
const ZONE = 'Asia/Kolkata';
/** Fixed list, inlined into SQL (never user input). */
const OPEN_SQL = Prisma.raw(`('OPEN','ASSIGNED','IN_PROGRESS','PENDING_VERIFICATION')`);

interface PerformanceRaw {
  open: number;
  overdue: number;
  resolved: number;
  within_sla: number;
  avg_hours: number | null;
}

function performanceSql(from: Date): Prisma.Sql {
  return Prisma.sql`
    COUNT(*) FILTER (WHERE wo.status::text IN ${OPEN_SQL})::int AS open,
    COUNT(*) FILTER (WHERE wo.status::text IN ${OPEN_SQL} AND wo."slaDueAt" < now())::int AS overdue,
    COUNT(*) FILTER (WHERE wo.status = 'RESOLVED' AND wo."verifiedAt" >= ${from})::int AS resolved,
    COUNT(*) FILTER (
      WHERE wo.status = 'RESOLVED' AND wo."verifiedAt" >= ${from}
        AND COALESCE(wo."completedAt", wo."verifiedAt") <= wo."slaDueAt"
    )::int AS within_sla,
    AVG(EXTRACT(EPOCH FROM (COALESCE(wo."completedAt", wo."verifiedAt") - wo."createdAt")) / 3600)
      FILTER (WHERE wo.status = 'RESOLVED' AND wo."verifiedAt" >= ${from})::float8 AS avg_hours`;
}

/** Only jobs that matter for the period: open now, created or verified in it. */
function relevantSql(from: Date): Prisma.Sql {
  return Prisma.sql`(wo.status::text IN ${OPEN_SQL} OR wo."createdAt" >= ${from} OR wo."verifiedAt" >= ${from})`;
}

function toPerformance(row: PerformanceRaw) {
  return {
    open: row.open,
    overdue: row.overdue,
    resolved: row.resolved,
    resolvedWithinSla: row.within_sla,
    averageRepairHours: row.avg_hours === null ? null : Math.round(row.avg_hours * 10) / 10,
  };
}

const localDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Every bucket start (`YYYY-MM-DD`, India time) from `from` to `to`, so gaps show as zero. */
function bucketDates(from: Date, to: Date, bucket: 'day' | 'month'): string[] {
  const dates: string[] = [];
  if (bucket === 'day') {
    for (let at = from.getTime(); at <= to.getTime() + DAY_MS / 2; at += DAY_MS) {
      const date = localDate.format(new Date(at));
      if (dates.at(-1) !== date) dates.push(date);
    }
    const last = localDate.format(to);
    if (dates.at(-1) !== last) dates.push(last);
    return dates;
  }
  const [startYear, startMonth] = localDate.format(from).split('-').map(Number) as [number, number];
  const [endYear, endMonth] = localDate.format(to).split('-').map(Number) as [number, number];
  for (
    let year = startYear, month = startMonth;
    year < endYear || (year === endYear && month <= endMonth);
  ) {
    dates.push(`${year}-${String(month).padStart(2, '0')}-01`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return dates;
}

export async function reportBreakdown(tenantId: string, days: number): Promise<ReportBreakdownDto> {
  const to = new Date();
  const from = new Date(to.getTime() - days * DAY_MS);
  const bucket: 'day' | 'month' = days > 90 ? 'month' : 'day';
  const unit = Prisma.raw(`'${bucket}'`);
  const bucketOf = (column: Prisma.Sql) =>
    Prisma.sql`to_char(date_trunc(${unit}, ${column} AT TIME ZONE ${ZONE}), 'YYYY-MM-DD')`;

  const [
    created,
    resolved,
    complaints,
    energy,
    faults,
    wardPoles,
    wardJobs,
    technicians,
    agencies,
    sources,
  ] = await Promise.all([
    prisma.$queryRaw<{ d: string; n: number }[]>`
        SELECT ${bucketOf(Prisma.sql`wo."createdAt"`)} AS d, COUNT(*)::int AS n
        FROM work_orders wo
        WHERE wo."tenantId" = ${tenantId}::uuid AND wo."createdAt" >= ${from}
        GROUP BY 1`,
    prisma.$queryRaw<{ d: string; n: number }[]>`
        SELECT ${bucketOf(Prisma.sql`wo."verifiedAt"`)} AS d, COUNT(*)::int AS n
        FROM work_orders wo
        WHERE wo."tenantId" = ${tenantId}::uuid AND wo.status = 'RESOLVED'
          AND wo."verifiedAt" >= ${from}
        GROUP BY 1`,
    prisma.$queryRaw<{ d: string; n: number }[]>`
        SELECT ${bucketOf(Prisma.sql`c."createdAt"`)} AS d, COUNT(*)::int AS n
        FROM complaints c
        WHERE c."tenantId" = ${tenantId}::uuid AND c."createdAt" >= ${from}
        GROUP BY 1`,
    prisma.$queryRaw<{ d: string; kwh: number }[]>`
        SELECT d, (SUM(delta) / 1000.0)::float8 AS kwh
        FROM (
          SELECT ${bucketOf(Prisma.sql`r."receivedAt"`)} AS d,
                 GREATEST(MAX(r."energyWh") - MIN(r."energyWh"), 0) AS delta
          FROM device_readings r
          WHERE r."tenantId" = ${tenantId}::uuid AND r."receivedAt" >= ${from}
          GROUP BY r."deviceId", 1
        ) per_device
        GROUP BY d`,
    prisma.$queryRaw<{ fault: string; n: number }[]>`
        SELECT COALESCE(NULLIF(wo."faultType", ''), 'UNSPECIFIED') AS fault, COUNT(*)::int AS n
        FROM work_orders wo
        WHERE wo."tenantId" = ${tenantId}::uuid AND wo."createdAt" >= ${from}
        GROUP BY 1
        ORDER BY 2 DESC, 1`,
    prisma.$queryRaw<
      {
        ward_id: string | null;
        code: string | null;
        name: string | null;
        legacy: string | null;
        poles: number;
        working: number;
        faulty: number;
        offline: number;
      }[]
    >`
        SELECT p."wardId" AS ward_id, w.code, w.name,
               CASE WHEN p."wardId" IS NULL THEN NULLIF(TRIM(p.ward), '') END AS legacy,
               COUNT(*)::int AS poles,
               COUNT(*) FILTER (WHERE p."lightStatus" IN ('ON', 'DIMMED', 'OFF'))::int AS working,
               COUNT(*) FILTER (WHERE p."lightStatus" = 'FAULT')::int AS faulty,
               COUNT(*) FILTER (WHERE p."lightStatus" = 'OFFLINE')::int AS offline
        FROM poles p
        LEFT JOIN wards w ON w.id = p."wardId"
        WHERE p."tenantId" = ${tenantId}::uuid AND p."assetStatus" = 'ACTIVE'
        GROUP BY 1, 2, 3, 4`,
    prisma.$queryRaw<
      (PerformanceRaw & { ward_id: string | null; legacy: string | null; created: number })[]
    >`
        SELECT p."wardId" AS ward_id,
               CASE WHEN p."wardId" IS NULL THEN NULLIF(TRIM(p.ward), '') END AS legacy,
               COUNT(*) FILTER (WHERE wo."createdAt" >= ${from})::int AS created,
               ${performanceSql(from)}
        FROM work_orders wo
        JOIN poles p ON p.id = wo."poleId"
        WHERE wo."tenantId" = ${tenantId}::uuid AND ${relevantSql(from)}
        GROUP BY 1, 2`,
    prisma.$queryRaw<(PerformanceRaw & { id: string; name: string; agency: string | null })[]>`
        SELECT u.id, u.name, a.name AS agency, ${performanceSql(from)}
        FROM work_orders wo
        JOIN users u ON u.id = wo."assignedTechnicianId"
        LEFT JOIN agencies a ON a.id = u."agencyId"
        WHERE wo."tenantId" = ${tenantId}::uuid AND ${relevantSql(from)}
        GROUP BY u.id, u.name, a.name`,
    prisma.$queryRaw<(PerformanceRaw & { id: string; name: string })[]>`
        SELECT a.id, a.name, ${performanceSql(from)}
        FROM work_orders wo
        JOIN agencies a ON a.id = wo."assignedAgencyId"
        WHERE wo."tenantId" = ${tenantId}::uuid AND ${relevantSql(from)}
        GROUP BY a.id, a.name`,
    prisma.$queryRaw<{ total: number; simulated: number }[]>`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE d."isSimulated")::int AS simulated
        FROM devices d
        WHERE d.id IN (
          SELECT DISTINCT r."deviceId" FROM device_readings r
          WHERE r."tenantId" = ${tenantId}::uuid AND r."receivedAt" >= ${from}
        )`,
  ]);

  const byDate = <T extends { d: string }>(rows: T[]) => new Map(rows.map((row) => [row.d, row]));
  const createdBy = byDate(created);
  const resolvedBy = byDate(resolved);
  const complaintsBy = byDate(complaints);
  const energyBy = byDate(energy);
  const trend = bucketDates(from, to, bucket).map((date) => ({
    date,
    workOrdersCreated: createdBy.get(date)?.n ?? 0,
    workOrdersResolved: resolvedBy.get(date)?.n ?? 0,
    complaints: complaintsBy.get(date)?.n ?? 0,
    energyKWh: Math.round((energyBy.get(date)?.kwh ?? 0) * 10) / 10,
  }));

  const wardKey = (wardId: string | null, legacy: string | null) =>
    wardId ?? (legacy ? `legacy:${legacy.toLowerCase()}` : 'none');
  const jobsByWard = new Map(wardJobs.map((row) => [wardKey(row.ward_id, row.legacy), row]));
  const emptyPerformance: PerformanceRaw = {
    open: 0,
    overdue: 0,
    resolved: 0,
    within_sla: 0,
    avg_hours: null,
  };
  // Legacy text can differ only in case ("Ward 5" / "ward 5"): merge those pole rows.
  const wardRows = new Map<string, (typeof wardPoles)[number]>();
  for (const row of wardPoles) {
    const key = wardKey(row.ward_id, row.legacy);
    const existing = wardRows.get(key);
    if (existing) {
      existing.poles += row.poles;
      existing.working += row.working;
      existing.faulty += row.faulty;
      existing.offline += row.offline;
    } else {
      wardRows.set(key, { ...row });
    }
  }
  const wards = [...wardRows.entries()]
    .map(([key, row]) => {
      const jobs = jobsByWard.get(key);
      return {
        wardId: row.ward_id,
        code: row.code,
        name: row.name ?? row.legacy,
        poles: row.poles,
        working: row.working,
        faulty: row.faulty,
        offline: row.offline,
        workOrdersCreated: jobs?.created ?? 0,
        ...toPerformance(jobs ?? emptyPerformance),
      };
    })
    .sort(
      (a, b) =>
        b.faulty - a.faulty ||
        b.open - a.open ||
        (a.name ?? '￿').localeCompare(b.name ?? '￿', 'en', { numeric: true }),
    );

  const byResolved = <T extends { resolved: number; name: string }>(a: T, b: T) =>
    b.resolved - a.resolved || a.name.localeCompare(b.name);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    bucket,
    trend,
    faults: faults.map((row) => ({ faultType: row.fault, count: row.n })),
    wards,
    technicians: technicians
      .map((row) => ({ id: row.id, name: row.name, agency: row.agency, ...toPerformance(row) }))
      .sort(byResolved),
    agencies: agencies
      .map((row) => ({ id: row.id, name: row.name, ...toPerformance(row) }))
      .sort(byResolved),
    dataSources: {
      controllersReporting: sources[0]?.total ?? 0,
      simulatedControllersReporting: sources[0]?.simulated ?? 0,
    },
  };
}
