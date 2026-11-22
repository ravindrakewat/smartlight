/**
 * Simulated street-light controllers for demos and end-to-end testing without
 * hardware. Each registered controller of a city connects to the broker with its
 * own id and speaks protocol v1 exactly like the firmware: retained status +
 * Last Will, periodic telemetry, command handling with acknowledgements, and the
 * same mode priority (manual > schedule > fail-safe ON).
 *
 *   npm run simulate -w @smart-light/api -- --city indore-mc [--interval 30] [--fail sl-000004]
 *
 * Needs DATABASE_URL (to list the city's controllers) and MQTT_URL. Development only.
 */
import { parseArgs } from 'node:util';
import { createPrismaClient } from '@smart-light/db';
import {
  validDeviceCommandSchema,
  type DeviceCommand,
  type ScheduleStep,
} from '@smart-light/shared';
import 'dotenv/config';
import mqtt, { type MqttClient } from 'mqtt';

const { values } = parseArgs({
  options: {
    city: { type: 'string' },
    interval: { type: 'string', default: '30' },
    fail: { type: 'string', multiple: true, default: [] },
  },
});

const databaseUrl = process.env['DATABASE_URL'];
const mqttUrl = process.env['MQTT_URL'] ?? 'mqtt://localhost:1883';
if (!values.city || !databaseUrl) {
  console.error('Usage: simulate -- --city <tenant slug> (needs DATABASE_URL, MQTT_URL)');
  process.exit(1);
}
if (process.env['NODE_ENV'] === 'production') {
  console.error('Refusing to simulate controllers in production.');
  process.exit(1);
}

const intervalMs = Math.max(5, Number(values.interval)) * 1000;
const failing = new Set(values.fail);

// ─── Astronomical clock (same NOAA maths as firmware/main/sl_sun.c) ──────────

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function sunTimes(date: Date, lat: number, lng: number, tz: number): [number, number] | null {
  let y = date.getUTCFullYear();
  let m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.trunc(y / 100);
  const b = 2 - a + Math.trunc(a / 4);
  const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
  const t = (jd + (720 - tz) / 1440 - 2451545) / 36525;
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const ma = rad(357.52911 + t * (35999.05029 - 0.0001537 * t));
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(ma) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * ma) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * ma) * 0.000289;
  const om = rad(125.04 - 1934.136 * t);
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(om);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(om);
  const decl = Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda)));
  const yy = Math.tan(rad(eps) / 2) ** 2;
  const l = rad(l0);
  const eot =
    4 *
    deg(
      yy * Math.sin(2 * l) -
        2 * e * Math.sin(ma) +
        4 * e * yy * Math.sin(ma) * Math.cos(2 * l) -
        0.5 * yy * yy * Math.sin(4 * l) -
        1.25 * e * e * Math.sin(2 * ma),
    );
  const cosHa =
    Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(decl)) -
    Math.tan(rad(lat)) * Math.tan(decl);
  if (cosHa < -1 || cosHa > 1) return null;
  const ha = deg(Math.acos(cosHa));
  const noon = 720 - 4 * lng - eot + tz;
  return [noon - 4 * ha, noon + 4 * ha];
}

// ─── One simulated controller ────────────────────────────────────────────────

interface Schedule {
  id: string;
  utcOffsetMinutes: number;
  location?: { latitude: number; longitude: number };
  steps: ScheduleStep[];
}

class Controller {
  private client: MqttClient;
  private seq = 0;
  private energyWh = Math.random() * 20_000;
  private schedule: Schedule | null = null;
  private manual: { on: boolean; dim: number; until: number } | null = null;
  private faultRaised = false;
  private readonly bootAt = Date.now();

  constructor(
    private readonly tenant: string,
    private readonly id: string,
    private readonly watts: number,
    private readonly broken: boolean,
  ) {
    const base = `sl/v1/${tenant}/${id}`;
    this.client = mqtt.connect(mqttUrl, {
      clientId: id,
      will: {
        topic: `${base}/status`,
        payload: Buffer.from(JSON.stringify({ v: 1, ts: 0, online: false })),
        qos: 1,
        retain: true,
      },
    });
    this.client.on('connect', () => {
      this.publish(
        'status',
        { v: 1, ts: this.ts(), online: true, firmwareVersion: '1.0.0-sim', resetReason: 'poweron' },
        true,
      );
      void this.client.subscribeAsync(`${base}/cmd`, { qos: 1 });
      this.report();
    });
    this.client.on('message', (_topic, payload) => this.onCommand(payload.toString()));
  }

  private ts() {
    return Math.floor(Date.now() / 1000);
  }

  private publish(channel: string, body: unknown, retain = false) {
    this.client.publish(`sl/v1/${this.tenant}/${this.id}/${channel}`, JSON.stringify(body), {
      qos: channel === 'telemetry' ? 0 : 1,
      retain,
    });
  }

  /** Same priority as the firmware: manual > schedule (clock valid) > fail-safe ON. */
  private output(): { on: boolean; dim: number; mode: 'manual' | 'auto' | 'failsafe' } {
    if (this.manual && Date.now() < this.manual.until) {
      return { on: this.manual.on, dim: this.manual.on ? this.manual.dim : 0, mode: 'manual' };
    }
    this.manual = null;
    const step = this.activeStep();
    if (step) {
      return { on: step.on, dim: step.on ? step.dimPercent : 0, mode: 'auto' };
    }
    return { on: true, dim: 100, mode: 'failsafe' };
  }

  private activeStep(): ScheduleStep | null {
    const schedule = this.schedule;
    if (!schedule) return null;
    const local = new Date(Date.now() + schedule.utcOffsetMinutes * 60_000);
    const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
    const sun = schedule.location
      ? sunTimes(
          local,
          schedule.location.latitude,
          schedule.location.longitude,
          schedule.utcOffsetMinutes,
        )
      : null;
    const resolved: number[] = [];
    for (const step of schedule.steps) {
      if (step.anchor === 'clock') resolved.push(step.atMinute);
      else if (!sun) return null;
      else {
        const base = step.anchor === 'sunset' ? sun[1] : sun[0];
        resolved.push((((Math.round(base) + step.offsetMinutes) % 1440) + 1440) % 1440);
      }
    }
    let current = -1;
    let latest = -1;
    resolved.forEach((at, index) => {
      if (at <= minute && (current < 0 || at > resolved[current]!)) current = index;
      if (latest < 0 || at > resolved[latest]!) latest = index;
    });
    return schedule.steps[current >= 0 ? current : latest] ?? null;
  }

  report() {
    const { on, dim, mode } = this.output();
    const voltage = 228 + Math.random() * 8;
    const lampDraws = on && !this.broken;
    const power = lampDraws ? (this.watts * dim) / 100 + Math.random() * 2 : 0.6;
    const current = lampDraws ? power / voltage / 0.95 : 0.003;
    this.energyWh += (power * intervalMs) / 3_600_000;
    this.publish('telemetry', {
      v: 1,
      ts: this.ts(),
      seq: this.seq++,
      lamp: { on, dimPercent: dim, mode },
      electrical: {
        voltageV: Math.round(voltage * 10) / 10,
        currentA: Math.round(current * 1000) / 1000,
        powerW: Math.round(power * 10) / 10,
        energyWh: Math.round(this.energyWh * 10) / 10,
        ...(lampDraws ? { powerFactor: 0.95 } : {}),
      },
      environment: { motionDetected: Math.random() < 0.1 },
      device: {
        firmwareVersion: '1.0.0-sim',
        uptimeSec: Math.floor((Date.now() - this.bootAt) / 1000),
        network: 'cellular',
        rssiDbm: -70 - Math.floor(Math.random() * 20),
        boardTempC: 38 + Math.random() * 6,
      },
    });
    // A broken lamp raises lamp_failure once while the relay is on.
    if (this.broken && on && !this.faultRaised) {
      this.faultRaised = true;
      this.publish('event', {
        v: 1,
        ts: this.ts(),
        seq: this.seq++,
        type: 'lamp_failure',
        severity: 'critical',
        snapshot: { voltageV: Math.round(voltage), currentA: 0, lampOn: true },
        message: 'Simulated: relay on, no lamp current',
      });
    }
  }

  private onCommand(raw: string) {
    let command: DeviceCommand;
    try {
      command = validDeviceCommandSchema.parse(JSON.parse(raw));
    } catch {
      return;
    }
    const ack = (status: 'accepted' | 'rejected', reason?: string) =>
      this.publish('cmd/ack', {
        v: 1,
        ts: this.ts(),
        cmdId: command.cmdId,
        status,
        ...(reason ? { reason } : {}),
      });

    if (command.expiresAt && this.ts() > command.expiresAt)
      return ack('rejected', 'command expired');
    switch (command.action) {
      case 'set_output':
        this.manual = {
          on: command.on,
          dim: command.dimPercent,
          until: Date.now() + (command.overrideUntil - command.issuedAt) * 1000,
        };
        break;
      case 'set_auto':
        this.manual = null;
        break;
      case 'set_schedule':
        this.schedule = {
          id: command.scheduleId,
          utcOffsetMinutes: command.utcOffsetMinutes,
          ...(command.location ? { location: command.location } : {}),
          steps: command.steps,
        };
        break;
      case 'set_config':
        break;
      default:
        return ack('rejected', `${command.action} not supported by the simulator`);
    }
    ack('accepted');
    this.report();
  }

  stop() {
    this.publish('status', { v: 1, ts: this.ts(), online: false }, true);
    return this.client.endAsync();
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

const prisma = createPrismaClient(databaseUrl, { maxConnections: 1 });
const devices = await prisma.device.findMany({
  where: { tenant: { slug: values.city }, poleId: { not: null } },
  select: { deviceId: true, pole: { select: { wattage: true } } },
  orderBy: { deviceId: 'asc' },
});
await prisma.$disconnect();

if (devices.length === 0) {
  console.error(`No controllers fitted on poles in ${values.city}.`);
  process.exit(1);
}

const controllers = devices.map(
  (device) =>
    new Controller(
      values.city!,
      device.deviceId,
      device.pole?.wattage ?? 90,
      failing.has(device.deviceId),
    ),
);
console.log(
  `Simulating ${controllers.length} controllers of ${values.city} on ${mqttUrl}, telemetry every ${intervalMs / 1000}s` +
    (failing.size ? `; broken lamps: ${[...failing].join(', ')}` : ''),
);
const timer = setInterval(
  () => controllers.forEach((controller) => controller.report()),
  intervalMs,
);

const shutdown = async () => {
  clearInterval(timer);
  await Promise.all(controllers.map((controller) => controller.stop()));
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
