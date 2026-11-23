/**
 * Demo data for presentations: a realistic slice of a city that fills every screen
 * (live map, dashboard, pole pages with 24 h charts, alerts, work orders, complaints,
 * reports, audit trail, controllers list, staff and the technician app).
 *
 *   npm run demo:data -w @smart-light/db            local database (DATABASE_URL)
 *   npm run demo:data:render -w @smart-light/db     Render (RENDER_EXTERNAL_DATABASE_URL
 *                                                   from apps/api/.env)
 *   npm run demo:clear -w @smart-light/db           remove it again (also :render)
 *   npm run demo:lights-on -w @smart-light/db       show the demo lights switched ON by an
 *                                                   operator (daytime demos; also :render)
 *   npm run demo:lights-auto -w @smart-light/db     back to their schedule (also :render)
 *
 * The city is chosen with DEMO_TENANT (default `indore-mc`); it must already exist.
 * Everything is added beside real data and is recognisable, so `demo:clear` can take
 * it out before go-live:
 *   - zones whose code starts with `DEMO-` (and every pole, controller, reading,
 *     alert, work order and complaint on those poles)
 *   - staff with an `@demo.smartlight.local` e-mail, demo agencies and schedules
 * Audit entries are append-only by design and stay.
 *
 * Staff password: DEMO_STAFF_PASSWORD if set; locally `SmartLight@2026`; on Render a
 * random one is generated and printed once in your terminal.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { formatPoleCode } from '@smart-light/shared';
import { createPrismaClient, Prisma, type LightStatus } from '../src';
import { hashPassword } from '../src/security/password';

const useRender = process.argv.includes('--render');
const clearOnly = process.argv.includes('--clear');
const lightsMode = process.argv.includes('--lights-on')
  ? 'on'
  : process.argv.includes('--lights-auto')
    ? 'auto'
    : null;
loadEnv({ path: useRender ? '../../apps/api/.env' : '.env', quiet: true });

const rawUrl = useRender
  ? process.env['RENDER_EXTERNAL_DATABASE_URL']
  : process.env['DATABASE_URL'];
if (!rawUrl) {
  console.error(
    useRender
      ? 'RENDER_EXTERNAL_DATABASE_URL is not set in apps/api/.env.'
      : 'DATABASE_URL is not set (copy packages/db/.env.example to .env).',
  );
  process.exit(1);
}
const databaseUrl =
  useRender && !/[?&]sslmode=/.test(rawUrl)
    ? `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}sslmode=verify-full`
    : rawUrl;

const TENANT_SLUG = process.env['DEMO_TENANT'] ?? 'indore-mc';
const ZONE_PREFIX = 'DEMO-';
const EMAIL_DOMAIN = '@demo.smartlight.local';
const SCHEDULE_SUFFIX = ' · Demo';
const AGENCY_NAMES = {
  municipal: 'Electrical Department (Demo)',
  contractor: 'Shree Ganesh Electricals (Demo)',
};
const CITIZEN_PHONES = [
  '+919990000101',
  '+919990000102',
  '+919990000103',
  '+919990000104',
  '+919990000105',
];

const prisma = createPrismaClient(databaseUrl);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.now();

/** Deterministic pseudo-random numbers so every run builds the same city. */
let randomState = 20_261_123;
function random(): number {
  randomState = (randomState * 1_103_515_245 + 12_345) % 2_147_483_648;
  return randomState / 2_147_483_648;
}
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
const between = (low: number, high: number) => low + random() * (high - low);
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Minute of the day in India (IST, UTC+5:30). */
const istMinute = (at: number) => (Math.floor(at / MINUTE) + 330) % 1440;

// Approximate sunset/sunrise for central India in late autumn (charts only; the
// controllers compute the real times themselves).
const SUNSET = 17 * 60 + 45;
const SUNRISE = 6 * 60 + 45;
const isDarkAt = (at: number) => {
  const minute = istMinute(at);
  return minute >= SUNSET || minute < SUNRISE;
};

type Plan = 'standard' | 'market';
/** What the schedule asks of the lamp at a moment. */
function planAt(plan: Plan, at: number): { on: boolean; dim: number } {
  if (!isDarkAt(at)) return { on: false, dim: 0 };
  const minute = istMinute(at);
  if (plan === 'standard' && (minute >= 23 * 60 + 30 || minute < 5 * 60)) {
    return { on: true, dim: 60 };
  }
  return { on: true, dim: 100 };
}

const STANDARD_STEPS = [
  { anchor: 'sunset', offsetMinutes: 0, on: true, dimPercent: 100 },
  { anchor: 'clock', atMinute: 23 * 60 + 30, on: true, dimPercent: 60 },
  { anchor: 'clock', atMinute: 5 * 60, on: true, dimPercent: 100 },
  { anchor: 'sunrise', offsetMinutes: 0, on: false, dimPercent: 0 },
];
const MARKET_STEPS = [
  { anchor: 'sunset', offsetMinutes: -15, on: true, dimPercent: 100 },
  { anchor: 'sunrise', offsetMinutes: 10, on: false, dimPercent: 0 },
];

const scheduleVersionId = (schedule: { id: string; updatedAt: Date }) =>
  `${schedule.id}@${Math.floor(schedule.updatedAt.getTime() / 1000).toString(36)}`;

async function reserve(tenantId: string, name: string, count: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ value: number }[]>`
    INSERT INTO "tenant_counters" ("tenantId", "name", "value")
    VALUES (${tenantId}::uuid, ${name}, ${count})
    ON CONFLICT ("tenantId", "name")
    DO UPDATE SET "value" = "tenant_counters"."value" + ${count}
    RETURNING "value"`;
  return (rows[0]?.value ?? count) - count + 1;
}

async function inChunks<T>(rows: T[], size: number, write: (chunk: T[]) => Promise<unknown>) {
  for (let start = 0; start < rows.length; start += size) {
    await write(rows.slice(start, start + size));
  }
}

// ─── City layout: real main roads, poles every ~35 m on alternating sides ────

interface ZoneSpec {
  code: string;
  name: string;
  road: string;
  wardBase: number;
  plan: Plan;
  /** Waypoints along the road [lat, lng]. */
  path: [number, number][];
  poles: number;
}

const ZONES: ZoneSpec[] = [
  {
    code: 'DEMO-VJN',
    name: 'Vijay Nagar',
    road: 'AB Road, Vijay Nagar',
    wardBase: 36,
    plan: 'standard',
    path: [
      [22.7334, 75.8842],
      [22.7432, 75.8889],
      [22.7515, 75.8935],
      [22.757, 75.899],
    ],
    poles: 48,
  },
  {
    code: 'DEMO-PLS',
    name: 'Palasia',
    road: 'MG Road, Palasia',
    wardBase: 52,
    plan: 'standard',
    path: [
      [22.7242, 75.8868],
      [22.7226, 75.8792],
      [22.7196, 75.8705],
    ],
    poles: 36,
  },
  {
    code: 'DEMO-RJW',
    name: 'Rajwada Bazaar',
    road: 'Jawahar Marg, Rajwada',
    wardBase: 61,
    plan: 'market',
    path: [
      [22.7187, 75.8512],
      [22.7184, 75.8551],
      [22.7179, 75.8622],
    ],
    poles: 30,
  },
  {
    code: 'DEMO-BWK',
    name: 'Bhawarkuan',
    road: 'Ring Road, Bhawarkuan',
    wardBase: 71,
    plan: 'standard',
    path: [
      [22.6928, 75.8676],
      [22.6962, 75.8745],
      [22.7008, 75.8812],
    ],
    poles: 36,
  },
  {
    code: 'DEMO-SDN',
    name: 'Sudama Nagar',
    road: 'Sudama Nagar Main Road',
    wardBase: 79,
    plan: 'standard',
    path: [
      [22.6985, 75.8318],
      [22.7012, 75.8357],
      [22.7049, 75.8401],
    ],
    poles: 28,
  },
  {
    code: 'DEMO-ANP',
    name: 'Annapurna',
    road: 'Annapurna Road',
    wardBase: 66,
    plan: 'standard',
    path: [
      [22.6951, 75.8452],
      [22.6987, 75.8481],
      [22.7022, 75.851],
    ],
    poles: 26,
  },
];

/** Evenly spaced points along a polyline, nudged left/right of the road centre. */
function polesAlong(path: [number, number][], count: number): [number, number][] {
  const segments = path.slice(1).map((end, index) => {
    const start = path[index] as [number, number];
    return { start, end, length: Math.hypot(end[0] - start[0], end[1] - start[1]) };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  const points: [number, number][] = [];
  for (let index = 0; index < count; index++) {
    let distance = (total * index) / Math.max(1, count - 1);
    const segment =
      segments.find((candidate) => {
        if (distance <= candidate.length) return true;
        distance -= candidate.length;
        return false;
      }) ?? (segments[segments.length - 1] as (typeof segments)[number]);
    const ratio = Math.min(1, distance / segment.length);
    const lat = segment.start[0] + (segment.end[0] - segment.start[0]) * ratio;
    const lng = segment.start[1] + (segment.end[1] - segment.start[1]) * ratio;
    // Perpendicular offset of ~12 m, alternating sides of the road.
    const side = index % 2 === 0 ? 1 : -1;
    const normLat = -(segment.end[1] - segment.start[1]) / segment.length;
    const normLng = (segment.end[0] - segment.start[0]) / segment.length;
    points.push([lat + normLat * 0.00011 * side, lng + normLng * 0.00011 * side]);
  }
  return points;
}

// ─── Clear ───────────────────────────────────────────────────────────────────

async function clearDemo(tenantId: string): Promise<void> {
  const zones = await prisma.zone.findMany({
    where: { tenantId, code: { startsWith: ZONE_PREFIX } },
    select: { id: true },
  });
  const zoneIds = zones.map((zone) => zone.id);
  const poles = await prisma.pole.findMany({
    where: { tenantId, zoneId: { in: zoneIds } },
    select: { id: true },
  });
  const poleIds = poles.map((pole) => pole.id);

  await prisma.$transaction(
    async (tx) => {
      const devices = await tx.device.findMany({
        where: { poleId: { in: poleIds } },
        select: { id: true },
      });
      const deviceIds = devices.map((device) => device.id);
      await tx.deviceEvent.deleteMany({ where: { deviceId: { in: deviceIds } } });
      await tx.device.deleteMany({ where: { id: { in: deviceIds } } }); // readings + commands cascade
      await tx.complaint.deleteMany({ where: { poleId: { in: poleIds } } });
      await tx.workOrder.deleteMany({ where: { poleId: { in: poleIds } } }); // events cascade
      await tx.pole.deleteMany({ where: { id: { in: poleIds } } });
      await tx.zone.deleteMany({ where: { id: { in: zoneIds } } });
      await tx.schedule.deleteMany({
        where: {
          tenantId,
          name: { endsWith: SCHEDULE_SUFFIX },
          zones: { none: {} },
          isDefault: false,
        },
      });
      await tx.user.deleteMany({ where: { tenantId, email: { endsWith: EMAIL_DOMAIN } } });
      await tx.agency.deleteMany({
        where: { tenantId, name: { in: Object.values(AGENCY_NAMES) }, users: { none: {} } },
      });
      await tx.citizen.deleteMany({
        where: { phone: { in: CITIZEN_PHONES }, complaints: { none: {} } },
      });
    },
    { timeout: 120_000 },
  );

  // A demo schedule left as the city default is only removed when nothing else uses it.
  const leftover = await prisma.schedule.findMany({
    where: { tenantId, name: { endsWith: SCHEDULE_SUFFIX } },
  });
  if (leftover.length > 0) {
    console.log(
      `Kept ${leftover.length} demo schedule(s) still in use as the city default: ` +
        leftover.map((schedule) => schedule.name).join(', '),
    );
  }
  console.log(`Removed ${poleIds.length} demo poles, ${zoneIds.length} zones and their history.`);
}

// ─── Lights on / back to schedule ────────────────────────────────────────────

/**
 * Shows the demo poles as an operator override ("festival lighting") or back on
 * their schedule, as if the controllers had confirmed it. Faulty, offline and
 * controller-less poles keep their state. Palasia is dimmed so the map shows both.
 */
async function setDemoLights(tenantId: string, mode: 'on' | 'auto'): Promise<void> {
  const poles = await prisma.pole.findMany({
    where: {
      tenantId,
      zone: { code: { startsWith: ZONE_PREFIX } },
      lightStatus: { notIn: ['FAULT', 'OFFLINE', 'UNKNOWN'] },
      device: { isNot: null },
    },
    include: { zone: { select: { code: true } }, device: true },
  });
  const now = new Date();
  const readings: Prisma.DeviceReadingCreateManyInput[] = [];
  const poleIdsByStatus: Record<'ON' | 'DIMMED' | 'OFF', string[]> = {
    ON: [],
    DIMMED: [],
    OFF: [],
  };
  const updates = poles.map((pole) => {
    const device = pole.device as NonNullable<typeof pole.device>;
    const plan: Plan = pole.zone?.code === 'DEMO-RJW' ? 'market' : 'standard';
    const output =
      mode === 'on'
        ? { on: true, dim: pole.zone?.code === 'DEMO-PLS' ? 60 : 100 }
        : planAt(plan, now.getTime());
    const status = !output.on ? 'OFF' : output.dim < 100 ? 'DIMMED' : 'ON';
    const wattage = pole.wattage ?? 90;
    const power = output.on ? round(((wattage * output.dim) / 100) * between(0.93, 1.01)) : 0;
    const voltage = round(between(228, 240));
    const telemetry = (device.lastTelemetry ?? {}) as {
      lamp?: object;
      electrical?: { energyWh?: number };
      environment?: object;
    };
    const energyWh = telemetry.electrical?.energyWh ?? 0;
    const operatingMode = mode === 'on' ? 'manual' : 'auto';
    const electrical = {
      voltageV: voltage,
      currentA: round(power / voltage / 0.96, 3),
      powerW: power,
      energyWh,
      powerFactor: 0.96,
    };
    readings.push({
      deviceId: device.id,
      tenantId,
      receivedAt: now,
      deviceTs: Math.floor(now.getTime() / 1000),
      lampOn: output.on,
      dimPercent: output.dim,
      mode: operatingMode,
      voltageV: voltage,
      currentA: electrical.currentA,
      powerW: power,
      energyWh,
      rssiDbm: Math.round(between(-90, -62)),
      boardTempC: round(between(30, 42)),
    });
    poleIdsByStatus[status].push(pole.id);
    return Prisma.sql`(${device.id}::uuid, ${output.on}::boolean, ${output.dim}::int, ${operatingMode}::text, ${JSON.stringify(
      {
        ...telemetry,
        ts: Math.floor(now.getTime() / 1000),
        lamp: { on: output.on, dimPercent: output.dim, mode: operatingMode },
        electrical,
      },
    )}::jsonb)`;
  });
  // Bulk statements, no per-pole transactions: the Render database is far away
  // and allows few connections.
  for (const [status, ids] of Object.entries(poleIdsByStatus)) {
    if (ids.length > 0) {
      await prisma.pole.updateMany({
        where: { id: { in: ids } },
        data: { lightStatus: status as LightStatus, lightStatusAt: now },
      });
    }
  }
  if (updates.length > 0) {
    await prisma.$executeRaw`
      UPDATE "devices" AS d
      SET "online" = true, "lampOn" = v.lamp_on, "dimPercent" = v.dim, "mode" = v.mode,
          "lastSeenAt" = ${now}, "lastTelemetryAt" = ${now}, "lastTelemetry" = v.telemetry,
          "updatedAt" = ${now}
      FROM (VALUES ${Prisma.join(updates)}) AS v(id, lamp_on, dim, mode, telemetry)
      WHERE d."id" = v.id`;
  }
  await prisma.deviceReading.createMany({ data: readings });
  const lit = readings.filter((reading) => reading.lampOn).length;
  console.log(
    mode === 'on'
      ? `${lit} demo lights shown ON (Palasia dimmed to 60 %). Faulty/offline poles unchanged.`
      : `${poles.length} demo lights back on their schedule (${lit} lit right now).`,
  );
}

// ─── Build ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) {
    console.error(`City "${TENANT_SLUG}" not found. Onboard it first or set DEMO_TENANT.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Database: ${new URL(databaseUrl).hostname}  City: ${tenant.name}`);

  if (clearOnly) {
    await clearDemo(tenant.id);
    return;
  }
  if (lightsMode) {
    await setDemoLights(tenant.id, lightsMode);
    return;
  }
  if (
    await prisma.zone.count({ where: { tenantId: tenant.id, code: { startsWith: ZONE_PREFIX } } })
  ) {
    console.error('Demo data is already present. Run demo:clear first to rebuild it.');
    process.exitCode = 1;
    return;
  }

  // ── People ──
  const generatedPassword = useRender && !process.env['DEMO_STAFF_PASSWORD'];
  const password =
    process.env['DEMO_STAFF_PASSWORD'] ??
    (useRender ? `Demo#${randomBytes(9).toString('base64url')}` : 'SmartLight@2026');
  const passwordHash = await hashPassword(password);

  const municipal = await prisma.agency.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: AGENCY_NAMES.municipal } },
    update: {},
    create: { tenantId: tenant.id, name: AGENCY_NAMES.municipal, type: 'MUNICIPAL' },
  });
  const contractor = await prisma.agency.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: AGENCY_NAMES.contractor } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: AGENCY_NAMES.contractor,
      type: 'CONTRACTOR',
      contactPhone: '+919990000201',
    },
  });

  const slug = tenant.code.toLowerCase();
  const staffSpecs: Omit<Prisma.UserCreateManyInput, 'passwordHash' | 'tenantId'>[] = [
    { role: 'SUPERVISOR', name: 'Rakesh Verma (JE)', email: `je.${slug}${EMAIL_DOMAIN}` },
    {
      role: 'OPERATOR',
      name: 'Neha Joshi (Control Room)',
      email: `control.${slug}${EMAIL_DOMAIN}`,
    },
    {
      role: 'AGENCY_MANAGER',
      name: 'Mahesh Patidar',
      email: `manager.${slug}${EMAIL_DOMAIN}`,
      agencyId: contractor.id,
    },
    {
      role: 'TECHNICIAN',
      name: 'Suresh Yadav',
      email: `tech1.${slug}${EMAIL_DOMAIN}`,
      phone: '+919990000301',
      agencyId: municipal.id,
    },
    {
      role: 'TECHNICIAN',
      name: 'Ramesh Chouhan',
      email: `tech2.${slug}${EMAIL_DOMAIN}`,
      phone: '+919990000302',
      agencyId: municipal.id,
    },
    {
      role: 'TECHNICIAN',
      name: 'Imran Khan',
      email: `tech3.${slug}${EMAIL_DOMAIN}`,
      phone: '+919990000303',
      agencyId: contractor.id,
    },
    {
      role: 'TECHNICIAN',
      name: 'Deepak Malviya',
      email: `tech4.${slug}${EMAIL_DOMAIN}`,
      phone: '+919990000304',
      agencyId: contractor.id,
    },
  ];
  await prisma.user.createMany({
    data: staffSpecs.map((spec) => ({
      ...spec,
      tenantId: tenant.id,
      passwordHash,
      lastLoginAt: new Date(NOW - between(1, 30) * HOUR),
    })),
    skipDuplicates: true,
  });
  const staff = await prisma.user.findMany({
    where: { tenantId: tenant.id, email: { endsWith: EMAIL_DOMAIN } },
  });
  const supervisor = staff.find((user) => user.role === 'SUPERVISOR');
  const operator = staff.find((user) => user.role === 'OPERATOR');
  const technicians = staff.filter((user) => user.role === 'TECHNICIAN');
  const admin =
    (await prisma.user.findFirst({ where: { tenantId: tenant.id, role: 'MUNICIPAL_ADMIN' } })) ??
    supervisor;
  if (!supervisor || !operator || !admin || technicians.length === 0) {
    throw new Error('Demo staff missing');
  }

  // ── Schedules ──
  const standard = await prisma.schedule.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: `Standard raat${SCHEDULE_SUFFIX}` } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: `Standard raat${SCHEDULE_SUFFIX}`,
      steps: STANDARD_STEPS,
      isDefault:
        (await prisma.schedule.count({ where: { tenantId: tenant.id, isDefault: true } })) === 0,
    },
  });
  const market = await prisma.schedule.upsert({
    where: {
      tenantId_name: { tenantId: tenant.id, name: `Bazaar - poori raat${SCHEDULE_SUFFIX}` },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: `Bazaar - poori raat${SCHEDULE_SUFFIX}`,
      steps: MARKET_STEPS,
    },
  });

  // ── Zones, poles, controllers ──
  const totalPoles = ZONES.reduce((sum, zone) => sum + zone.poles, 0);
  let serial = await reserve(tenant.id, 'pole', totalPoles);

  interface DemoPole {
    id: string;
    code: string;
    latitude: number;
    longitude: number;
    address: string;
    wattage: number;
    plan: Plan;
    status: LightStatus;
    deviceId?: string;
    /** When the controller stopped working / reporting (fault or offline). */
    brokenSince?: number;
  }
  const demoPoles: DemoPole[] = [];

  for (const spec of ZONES) {
    const zone = await prisma.zone.create({
      data: {
        tenantId: tenant.id,
        code: spec.code,
        name: spec.name,
        scheduleId: spec.plan === 'market' ? market.id : standard.id,
      },
    });
    const points = polesAlong(spec.path, spec.poles);
    const rows: Prisma.PoleCreateManyInput[] = points.map(([latitude, longitude], index) => ({
      tenantId: tenant.id,
      zoneId: zone.id,
      serial: serial + index,
      code: formatPoleCode(tenant.code, serial + index),
      latitude: round(latitude, 6),
      longitude: round(longitude, 6),
      address: `${spec.road}, near pole ${index + 1}`,
      ward: `Ward ${spec.wardBase + Math.floor(index / 12)}`,
      lampType: 'LED',
      wattage: spec.plan === 'market' ? 150 : pick([90, 90, 120]),
      installedAt: new Date(
        Date.UTC(2025, Math.floor(random() * 12), 1 + Math.floor(random() * 27)),
      ),
      lightStatus: 'UNKNOWN',
    }));
    serial += points.length;
    const created = await prisma.pole.createManyAndReturn({
      data: rows,
      select: {
        id: true,
        code: true,
        latitude: true,
        longitude: true,
        address: true,
        wattage: true,
      },
    });
    for (const pole of created) {
      demoPoles.push({
        ...pole,
        address: pole.address ?? spec.road,
        wattage: pole.wattage ?? 90,
        plan: spec.plan,
        status: 'UNKNOWN',
      });
    }
  }

  // Status now: most follow the schedule; a few have faults or lost connectivity;
  // roughly one pole in seven has no controller yet (older stretches).
  const nowPlan = (pole: DemoPole) => planAt(pole.plan, NOW);
  for (const pole of demoPoles) {
    const roll = random();
    if (roll < 0.14) continue; // no controller
    pole.deviceId = `sl-${slug}-${pole.code.split('-')[1]}`;
    if (roll < 0.2) {
      pole.status = 'FAULT';
      pole.brokenSince = NOW - between(2, 20) * HOUR;
    } else if (roll < 0.235) {
      pole.status = 'OFFLINE';
      pole.brokenSince = NOW - between(3, 30) * HOUR;
    } else {
      const plan = nowPlan(pole);
      pole.status = !plan.on ? 'OFF' : plan.dim < 100 ? 'DIMMED' : 'ON';
    }
  }
  await inChunks(demoPoles, 200, async (chunk) => {
    for (const status of ['ON', 'DIMMED', 'OFF', 'FAULT', 'OFFLINE'] as const) {
      const ids = chunk.filter((pole) => pole.status === status).map((pole) => pole.id);
      if (ids.length) {
        await prisma.pole.updateMany({
          where: { id: { in: ids } },
          data: { lightStatus: status, lightStatusAt: new Date(NOW - between(5, 60) * MINUTE) },
        });
      }
    }
  });

  const withDevice = demoPoles.filter((pole) => pole.deviceId);
  const devices = await prisma.device.createManyAndReturn({
    data: withDevice.map((pole) => {
      const offline = pole.status === 'OFFLINE';
      const lastAt = offline ? (pole.brokenSince as number) : NOW - between(1, 4) * MINUTE;
      const plan = planAt(pole.plan, lastAt);
      const fault = pole.status === 'FAULT' && plan.on;
      const power =
        plan.on && !fault ? round(((pole.wattage * plan.dim) / 100) * between(0.92, 1.02)) : 0;
      const voltage = round(between(226, 241));
      const rssi = Math.round(between(-95, -61));
      return {
        tenantId: tenant.id,
        poleId: pole.id,
        deviceId: pole.deviceId as string,
        serialNumber: `SL1-${pole.code.split('-')[1]}`,
        firmwareVersion: pick(['1.0.3', '1.0.3', '1.0.3', '1.0.2']),
        online: !offline,
        lastSeenAt: new Date(lastAt),
        lampOn: plan.on,
        dimPercent: plan.dim,
        mode: 'auto',
        resetReason: 'poweron',
        appliedScheduleId: scheduleVersionId(pole.plan === 'market' ? market : standard),
        lastTelemetryAt: new Date(lastAt),
        lastTelemetry: {
          v: 1,
          ts: Math.floor(lastAt / 1000),
          seq: Math.floor(between(100, 5000)),
          lamp: { on: plan.on, dimPercent: plan.dim, mode: 'auto' },
          electrical: {
            voltageV: voltage,
            currentA: round(power / voltage / 0.96, 3),
            powerW: power,
            energyWh: 0, // filled in after the history below
            powerFactor: 0.96,
          },
          environment: { isDark: isDarkAt(lastAt), motionDetected: false },
          device: {
            firmwareVersion: '1.0.3',
            uptimeSec: Math.floor(between(2, 40) * 86_400),
            network: rssi > -70 ? 'wifi' : 'cellular',
            rssiDbm: rssi,
            boardTempC: round(between(31, 44)),
          },
        },
      };
    }),
    select: { id: true, deviceId: true, poleId: true, lastTelemetry: true },
  });
  const deviceByPole = new Map(devices.map((device) => [device.poleId as string, device]));

  // ── Telemetry history: every 15 min for 24 h, plus one reading a day for 30 days ──
  const readings: Prisma.DeviceReadingCreateManyInput[] = [];
  for (const pole of withDevice) {
    const device = deviceByPole.get(pole.id);
    if (!device) continue;
    let energyWh = round(between(40_000, 180_000), 0);
    const times: number[] = [];
    for (let day = 30; day >= 2; day--) times.push(NOW - day * DAY);
    for (let at = NOW - DAY; at <= NOW; at += 15 * MINUTE) times.push(at);
    let previous = times[0] as number;
    for (const at of times) {
      if (pole.status === 'OFFLINE' && at > (pole.brokenSince as number)) break;
      const plan = planAt(pole.plan, at);
      const fault = pole.status === 'FAULT' && at > (pole.brokenSince as number);
      const power = plan.on && !fault ? ((pole.wattage * plan.dim) / 100) * between(0.92, 1.02) : 0;
      // Daily samples: add a typical night's consumption; 15-min samples: integrate.
      const gapHours = (at - previous) / HOUR;
      energyWh += gapHours > 1 ? (gapHours / 24) * pole.wattage * 11.5 * 0.88 : power * gapHours;
      previous = at;
      const voltage = between(224, 242);
      readings.push({
        deviceId: device.id,
        tenantId: tenant.id,
        receivedAt: new Date(at),
        deviceTs: Math.floor(at / 1000),
        lampOn: plan.on,
        dimPercent: plan.dim,
        mode: 'auto',
        voltageV: round(voltage),
        currentA: round(power / voltage / 0.96, 3),
        powerW: round(power),
        energyWh: round(energyWh),
        rssiDbm: Math.round(between(-95, -61)),
        boardTempC: round(between(28, 45)),
        motion: plan.on && random() < 0.18,
      });
    }
    const telemetry = device.lastTelemetry as { electrical: { energyWh: number } };
    telemetry.electrical.energyWh = round(energyWh);
    await prisma.device.update({
      where: { id: device.id },
      data: { lastTelemetry: telemetry as Prisma.InputJsonValue },
    });
  }
  await inChunks(readings, 2000, (chunk) => prisma.deviceReading.createMany({ data: chunk }));

  // ── Work orders: open jobs for today's faults, a month of finished repairs ──
  const brokenPoles = demoPoles.filter(
    (pole) => pole.status === 'FAULT' || pole.status === 'OFFLINE',
  );
  const HISTORY = 46;
  const historyPoles = Array.from({ length: HISTORY }, () => pick(demoPoles));
  let workOrderNumber = await reserve(tenant.id, 'work_order', brokenPoles.length + HISTORY + 2);
  const nextWorkOrder = () => `${tenant.code}-W-${String(workOrderNumber++).padStart(6, '0')}`;
  const slaHours = tenant.slaHours;

  interface JobRef {
    id: string;
    poleId: string;
    status: string;
    createdAt: Date;
    resolvedAt: Date | null;
    source: string;
  }
  const jobs: JobRef[] = [];
  const stages = ['ASSIGNED', 'IN_PROGRESS', 'OPEN', 'ASSIGNED', 'PENDING_VERIFICATION'] as const;
  const RESOLUTIONS = [
    'LAMP_REPLACED',
    'DRIVER_REPLACED',
    'WIRING_REPAIRED',
    'MCB_RESET',
    'CONTROLLER_REPLACED',
  ];

  for (const [index, pole] of brokenPoles.entries()) {
    const status = stages[index % stages.length] ?? 'OPEN';
    const createdAt = new Date((pole.brokenSince as number) + 4 * MINUTE);
    const technician = technicians[index % technicians.length] as (typeof technicians)[number];
    const assigned = status !== 'OPEN';
    const iot = pole.status === 'FAULT';
    const events: Prisma.WorkOrderEventCreateWithoutWorkOrderInput[] = [
      { type: 'CREATED', createdAt, note: iot ? 'Controller reported lamp failure' : null },
    ];
    if (assigned) {
      events.push({
        type: 'ASSIGNED',
        actor: { connect: { id: supervisor.id } },
        createdAt: new Date(createdAt.getTime() + 25 * MINUTE),
        note: `Assigned to ${technician.name}`,
      });
    }
    if (status === 'IN_PROGRESS' || status === 'PENDING_VERIFICATION') {
      events.push({
        type: 'STARTED',
        actor: { connect: { id: technician.id } },
        createdAt: new Date(createdAt.getTime() + 70 * MINUTE),
        latitude: pole.latitude,
        longitude: pole.longitude,
      });
    }
    if (status === 'PENDING_VERIFICATION') {
      events.push({
        type: 'COMPLETED',
        actor: { connect: { id: technician.id } },
        createdAt: new Date(createdAt.getTime() + 110 * MINUTE),
        note: 'Lamp replaced; waiting for the controller to confirm tonight',
      });
    }
    const job = await prisma.workOrder.create({
      data: {
        tenantId: tenant.id,
        number: nextWorkOrder(),
        poleId: pole.id,
        source: iot ? 'IOT_ALERT' : 'MANUAL',
        priority: iot ? 'HIGH' : 'NORMAL',
        faultType: iot ? 'lamp_failure' : 'offline',
        description: iot ? 'Relay ON but no lamp current' : 'Controller stopped reporting',
        status,
        assignedAgencyId: assigned ? technician.agencyId : null,
        assignedTechnicianId: assigned ? technician.id : null,
        createdById: iot ? null : operator.id,
        slaDueAt: new Date(createdAt.getTime() + slaHours * HOUR),
        startedAt:
          status === 'IN_PROGRESS' || status === 'PENDING_VERIFICATION'
            ? new Date(createdAt.getTime() + 70 * MINUTE)
            : null,
        completedAt:
          status === 'PENDING_VERIFICATION' ? new Date(createdAt.getTime() + 110 * MINUTE) : null,
        resolutionCode: status === 'PENDING_VERIFICATION' ? 'LAMP_REPLACED' : null,
        createdAt,
        events: { create: events },
      },
    });
    jobs.push({
      id: job.id,
      poleId: pole.id,
      status,
      createdAt,
      resolvedAt: null,
      source: job.source,
    });
  }

  for (const [index, pole] of historyPoles.entries()) {
    const createdAt = new Date(NOW - between(1.2, 29.5) * DAY);
    const late = random() < 0.13;
    const repairHours = late ? between(slaHours + 2, slaHours + 30) : between(2.5, slaHours - 3);
    const technician = pick(technicians);
    const completedAt = new Date(createdAt.getTime() + repairHours * HOUR);
    const verifiedAt = new Date(completedAt.getTime() + between(0.3, 9) * HOUR);
    const source = pick([
      'IOT_ALERT',
      'IOT_ALERT',
      'IOT_ALERT',
      'CITIZEN_COMPLAINT',
      'CITIZEN_COMPLAINT',
      'INSPECTION',
      'MANUAL',
    ] as const);
    const hasDevice = deviceByPole.has(pole.id);
    const resolution = pick(RESOLUTIONS);
    const job = await prisma.workOrder.create({
      data: {
        tenantId: tenant.id,
        number: nextWorkOrder(),
        poleId: pole.id,
        source,
        priority: source === 'IOT_ALERT' ? pick(['HIGH', 'HIGH', 'CRITICAL'] as const) : 'NORMAL',
        faultType:
          source === 'IOT_ALERT'
            ? pick(['lamp_failure', 'lamp_failure', 'over_current'])
            : pick(['LIGHT_OFF', 'FLICKERING', 'DAMAGED_POLE']),
        status: 'RESOLVED',
        assignedAgencyId: technician.agencyId,
        assignedTechnicianId: technician.id,
        createdById: source === 'MANUAL' || source === 'INSPECTION' ? supervisor.id : null,
        slaDueAt: new Date(createdAt.getTime() + slaHours * HOUR),
        startedAt: new Date(createdAt.getTime() + repairHours * 0.6 * HOUR),
        completedAt,
        verifiedAt,
        verificationMethod: hasDevice ? 'IOT_TELEMETRY' : 'SUPERVISOR',
        resolutionCode: resolution,
        resolutionNotes: index % 4 === 0 ? 'Old sodium fitting replaced with LED' : null,
        createdAt,
        events: {
          create: [
            { type: 'CREATED', createdAt },
            {
              type: 'ASSIGNED',
              actor: { connect: { id: supervisor.id } },
              createdAt: new Date(createdAt.getTime() + 30 * MINUTE),
            },
            {
              type: 'STARTED',
              actor: { connect: { id: technician.id } },
              createdAt: new Date(createdAt.getTime() + repairHours * 0.6 * HOUR),
              latitude: pole.latitude,
              longitude: pole.longitude,
            },
            ...(late
              ? [
                  {
                    type: 'SLA_BREACHED' as const,
                    createdAt: new Date(createdAt.getTime() + slaHours * HOUR),
                  },
                ]
              : []),
            {
              type: 'COMPLETED',
              actor: { connect: { id: technician.id } },
              createdAt: completedAt,
              note: resolution.replace(/_/g, ' ').toLowerCase(),
            },
            hasDevice
              ? {
                  type: 'VERIFIED' as const,
                  createdAt: verifiedAt,
                  note: 'Controller confirmed the lamp draws current',
                }
              : {
                  type: 'VERIFIED' as const,
                  actor: { connect: { id: supervisor.id } },
                  createdAt: verifiedAt,
                  note: 'Checked on site',
                },
          ],
        },
      },
    });
    jobs.push({
      id: job.id,
      poleId: pole.id,
      status: 'RESOLVED',
      createdAt,
      resolvedAt: verifiedAt,
      source,
    });
  }

  // ── Controller events (alerts) ──
  const events: Prisma.DeviceEventCreateManyInput[] = [];
  for (const job of jobs) {
    const device = deviceByPole.get(job.poleId);
    if (!device || job.source !== 'IOT_ALERT') continue;
    const at = job.createdAt.getTime() - 4 * MINUTE;
    events.push({
      tenantId: tenant.id,
      deviceId: device.id,
      poleId: job.poleId,
      type: 'lamp_failure',
      severity: 'critical',
      message: 'Relay ON but lamp current below 0.05 A',
      snapshot: { voltageV: round(between(226, 238)), currentA: 0.01, lampOn: true },
      deviceTs: Math.floor(at / 1000),
      seq: Math.floor(between(10, 900)),
      receivedAt: new Date(at),
      workOrderId: job.id,
      resolvedAt: job.resolvedAt,
    });
    if (job.resolvedAt) {
      events.push({
        tenantId: tenant.id,
        deviceId: device.id,
        poleId: job.poleId,
        type: 'fault_cleared',
        severity: 'info',
        clears: 'lamp_failure',
        message: 'Lamp current back to normal',
        deviceTs: Math.floor(job.resolvedAt.getTime() / 1000),
        seq: Math.floor(between(900, 2000)),
        receivedAt: job.resolvedAt,
        resolvedAt: job.resolvedAt,
      });
    }
  }
  // A few warnings without a work order: voltage dips and an unusual reboot.
  for (let index = 0; index < 9; index++) {
    const device = pick(devices);
    const at = NOW - between(0.5, 6) * DAY;
    const type = pick(['under_voltage', 'under_voltage', 'over_voltage', 'boot', 'day_burning']);
    const open = index < 3 && type !== 'boot';
    events.push({
      tenantId: tenant.id,
      deviceId: device.id,
      poleId: device.poleId,
      type,
      severity: type === 'boot' ? 'info' : 'warning',
      message:
        type === 'under_voltage'
          ? 'Supply voltage 182 V for 6 minutes'
          : type === 'over_voltage'
            ? 'Supply voltage 262 V for 3 minutes'
            : type === 'boot'
              ? 'Restarted after power cut (poweron)'
              : 'Lamp ON after sunrise',
      deviceTs: Math.floor(at / 1000),
      seq: Math.floor(between(10, 900)),
      receivedAt: new Date(open ? NOW - between(0.5, 5) * HOUR : at),
      resolvedAt:
        open || type === 'boot'
          ? type === 'boot'
            ? new Date(at)
            : null
          : new Date(at + 20 * MINUTE),
    });
  }
  await prisma.deviceEvent.createMany({ data: events });

  // ── Commands sent from the console (recent history on pole pages) ──
  const commands: Prisma.DeviceCommandCreateManyInput[] = [];
  for (const device of devices.slice(0, 40)) {
    const pole = demoPoles.find((candidate) => candidate.id === device.poleId) as DemoPole;
    const schedule = pole.plan === 'market' ? market : standard;
    const at = NOW - between(1, 6) * DAY;
    commands.push({
      tenantId: tenant.id,
      deviceId: device.id,
      action: 'set_schedule',
      payload: {
        v: 1,
        cmdId: randomUUID(),
        issuedAt: Math.floor(at / 1000),
        expiresAt: Math.floor(at / 1000) + 86_400,
        action: 'set_schedule',
        scheduleId: scheduleVersionId(schedule),
        utcOffsetMinutes: 330,
        location: { latitude: pole.latitude, longitude: pole.longitude },
        steps: schedule.steps as Prisma.InputJsonValue,
      },
      status: 'ACCEPTED',
      reason: 'Schedule assigned to zone',
      createdById: admin.id,
      createdAt: new Date(at),
      sentAt: new Date(at + 2_000),
      ackAt: new Date(at + 3_500),
      expiresAt: new Date(at + DAY),
    });
  }
  for (const device of devices.slice(0, 12)) {
    const at = NOW - between(2, 40) * HOUR;
    const minutes = pick([30, 60, 120]);
    commands.push({
      tenantId: tenant.id,
      deviceId: device.id,
      action: 'set_output',
      payload: {
        v: 1,
        cmdId: randomUUID(),
        issuedAt: Math.floor(at / 1000),
        expiresAt: Math.floor(at / 1000) + 300,
        action: 'set_output',
        on: true,
        dimPercent: 100,
        overrideUntil: Math.floor(at / 1000) + minutes * 60,
      },
      status: 'ACCEPTED',
      reason: pick(['Festival procession', 'Night inspection', 'Police request', 'Repair test']),
      createdById: pick([admin.id, operator.id]),
      createdAt: new Date(at),
      sentAt: new Date(at + 1_500),
      ackAt: new Date(at + 2_800),
      expiresAt: new Date(at + 5 * MINUTE),
    });
  }
  await prisma.deviceCommand.createMany({ data: commands });

  // ── Citizen complaints ──
  const citizens = await Promise.all(
    CITIZEN_PHONES.map((phone, index) =>
      prisma.citizen.upsert({
        where: { phone },
        update: {},
        create: {
          phone,
          name:
            ['Anita Sharma', 'Rohit Jain', 'Farhan Ali', 'Pooja Rathore', 'Vikas Soni'][index] ??
            null,
        },
      }),
    ),
  );
  const complaintJobs = jobs.filter(
    (job) => job.source === 'CITIZEN_COMPLAINT' || (job.status !== 'RESOLVED' && random() < 0.5),
  );
  let complaintNumber = await reserve(tenant.id, 'complaint', complaintJobs.length + 3);
  const DESCRIPTIONS: Record<string, string> = {
    LIGHT_OFF: 'Light band hai, raat ko andhera rehta hai',
    FLICKERING: 'Light baar baar jal bujh rahi hai',
    DAMAGED_POLE: 'Pole jhuka hua hai, gir sakta hai',
    DAY_BURNING: 'Din mein bhi light jal rahi hai',
    EXPOSED_WIRING: 'Pole ke neeche khule taar hain',
  };
  const complaints: Prisma.ComplaintCreateManyInput[] = complaintJobs.map((job) => {
    const pole = demoPoles.find((candidate) => candidate.id === job.poleId) as DemoPole;
    const category = pick([
      'LIGHT_OFF',
      'LIGHT_OFF',
      'LIGHT_OFF',
      'FLICKERING',
      'DAMAGED_POLE',
    ] as const);
    return {
      tenantId: tenant.id,
      number: `${tenant.code}-C-${String(complaintNumber++).padStart(6, '0')}`,
      poleId: pole.id,
      citizenId: pick(citizens).id,
      workOrderId: job.id,
      category,
      description: DESCRIPTIONS[category] ?? null,
      status:
        job.status === 'RESOLVED'
          ? 'RESOLVED'
          : job.status === 'OPEN'
            ? 'SUBMITTED'
            : 'IN_PROGRESS',
      source: pick(['WEB', 'WEB', 'MOBILE', 'CALL_CENTRE'] as const),
      latitude: pole.latitude,
      longitude: pole.longitude,
      resolvedAt: job.resolvedAt,
      createdAt: new Date(job.createdAt.getTime() - between(5, 50) * MINUTE),
    };
  });
  // Two fresh complaints nobody has looked at yet, plus one rejected duplicate.
  for (const [index, status] of (['SUBMITTED', 'SUBMITTED', 'REJECTED'] as const).entries()) {
    const pole = pick(demoPoles);
    complaints.push({
      tenantId: tenant.id,
      number: `${tenant.code}-C-${String(complaintNumber++).padStart(6, '0')}`,
      poleId: pole.id,
      citizenId: pick(citizens).id,
      category: index === 1 ? 'EXPOSED_WIRING' : 'DAY_BURNING',
      description: index === 1 ? DESCRIPTIONS['EXPOSED_WIRING'] : DESCRIPTIONS['DAY_BURNING'],
      status,
      source: 'WEB',
      latitude: pole.latitude,
      longitude: pole.longitude,
      createdAt: new Date(NOW - between(0.5, 8) * HOUR),
    });
  }
  await prisma.complaint.createMany({ data: complaints });

  // ── Audit trail (what the console shows under Audit) ──
  const audit: Prisma.AuditLogCreateManyInput[] = [];
  for (const user of [admin, supervisor, operator, ...technicians]) {
    for (let index = 0; index < 3; index++) {
      audit.push({
        tenantId: tenant.id,
        actorType: 'USER',
        actorId: user.id,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        ip: `49.36.${Math.floor(between(1, 250))}.${Math.floor(between(1, 250))}`,
        metadata: { client: user.role === 'TECHNICIAN' ? 'mobile' : 'web', demo: true },
        createdAt: new Date(NOW - between(0.1, 14) * DAY),
      });
    }
  }
  for (const job of jobs.filter((candidate) => candidate.status !== 'OPEN').slice(0, 30)) {
    audit.push({
      tenantId: tenant.id,
      actorType: 'USER',
      actorId: supervisor.id,
      action: 'work_order.assign',
      entityType: 'work_order',
      entityId: job.id,
      metadata: { demo: true },
      createdAt: new Date(job.createdAt.getTime() + 25 * MINUTE),
    });
    if (job.resolvedAt) {
      audit.push({
        tenantId: tenant.id,
        actorType: 'SYSTEM',
        action: 'work_order.verify',
        entityType: 'work_order',
        entityId: job.id,
        metadata: { method: 'IOT_TELEMETRY', demo: true },
        createdAt: job.resolvedAt,
      });
    }
  }
  for (const command of commands.filter((candidate) => candidate.action === 'set_output')) {
    audit.push({
      tenantId: tenant.id,
      actorType: 'USER',
      actorId: command.createdById ?? null,
      action: 'lighting.control',
      entityType: 'device',
      entityId: command.deviceId,
      metadata: { action: 'on', reason: command.reason, demo: true },
      createdAt: command.createdAt,
    });
  }
  audit.push(
    {
      tenantId: tenant.id,
      actorType: 'USER',
      actorId: admin.id,
      action: 'schedule.create',
      entityType: 'schedule',
      entityId: standard.id,
      metadata: { name: standard.name, demo: true },
      createdAt: new Date(NOW - 7 * DAY),
    },
    {
      tenantId: tenant.id,
      actorType: 'USER',
      actorId: admin.id,
      action: 'pole.import',
      entityType: 'pole',
      metadata: { count: totalPoles, demo: true },
      createdAt: new Date(NOW - 8 * DAY),
    },
  );
  await prisma.auditLog.createMany({ data: audit });

  // ── Summary ──
  const count = (status: LightStatus) => demoPoles.filter((pole) => pole.status === status).length;
  console.log('');
  console.log(`Added to ${tenant.name}:`);
  console.log(`  ${ZONES.length} zones, ${demoPoles.length} poles, ${devices.length} controllers`);
  console.log(
    `  now: ${count('ON')} on, ${count('DIMMED')} dimmed, ${count('OFF')} off, ` +
      `${count('FAULT')} fault, ${count('OFFLINE')} offline, ${count('UNKNOWN')} without controller`,
  );
  console.log(
    `  ${readings.length} telemetry readings, ${events.length} controller events, ${commands.length} commands`,
  );
  console.log(
    `  ${jobs.length} work orders, ${complaints.length} complaints, ${audit.length} audit entries`,
  );
  console.log('');
  console.log('Demo staff logins (console / mobile app):');
  for (const user of staff) console.log(`  ${user.role.padEnd(15)} ${user.email}`);
  if (generatedPassword) {
    console.log(`  Password (shown only now, keep it safe): ${password}`);
  } else if (!process.env['DEMO_STAFF_PASSWORD']) {
    console.log(`  Password: ${password}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
