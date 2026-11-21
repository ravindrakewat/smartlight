import { z } from 'zod';
import { MQTT_ID_PATTERN } from '../iot/topics';
import { paginationQuerySchema } from '../schemas/pagination';

export const LIGHT_STATUSES = ['UNKNOWN', 'ON', 'DIMMED', 'OFF', 'FAULT', 'OFFLINE'] as const;
export const lightStatusSchema = z.enum(LIGHT_STATUSES);
export type LightStatusName = z.infer<typeof lightStatusSchema>;

/** India's bounding box — rejects swapped or garbage coordinates. */
export const latitudeSchema = z.number().min(6).max(38);
export const longitudeSchema = z.number().min(68).max(98);

// ─── Zones ────────────────────────────────────────────────────────────────────

export const zoneSchema = z
  .object({ id: z.uuid(), code: z.string(), name: z.string(), poleCount: z.number().int() })
  .meta({ id: 'Zone' });

export type ZoneDto = z.infer<typeof zoneSchema>;

export const createZoneSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z0-9-]{1,10}$/, { error: 'Up to 10 capital letters, digits or hyphens' })
      .meta({ example: 'Z06' }),
    name: z.string().trim().min(2).max(80),
  })
  .meta({ id: 'CreateZoneRequest' });

// ─── Poles ────────────────────────────────────────────────────────────────────

export const poleDeviceSchema = z
  .object({
    deviceId: z.string(),
    online: z.boolean(),
    lastSeenAt: z.iso.datetime().nullable(),
    firmwareVersion: z.string().nullable(),
  })
  .meta({ id: 'PoleDevice' });

export const poleSchema = z
  .object({
    id: z.uuid(),
    code: z.string().meta({ example: 'IND-004182-7' }),
    latitude: z.number(),
    longitude: z.number(),
    address: z.string().nullable(),
    ward: z.string().nullable(),
    lampType: z.string().nullable(),
    wattage: z.number().int().nullable(),
    installedAt: z.iso.datetime().nullable(),
    assetStatus: z.enum(['ACTIVE', 'DECOMMISSIONED']),
    lightStatus: lightStatusSchema,
    lightStatusAt: z.iso.datetime().nullable(),
    zone: z.object({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
    device: poleDeviceSchema.nullable(),
  })
  .meta({ id: 'Pole' });

export type PoleDto = z.infer<typeof poleSchema>;

export const listPolesQuerySchema = paginationQuerySchema.extend({
  zoneId: z.uuid().optional(),
  lightStatus: lightStatusSchema.optional(),
  /** Matches pole code, address or ward. */
  search: z.string().trim().max(100).optional(),
  tenantId: z.uuid().optional(),
});

export const createPoleSchema = z
  .object({
    zoneId: z.uuid().optional(),
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    address: z.string().trim().max(200).optional(),
    ward: z.string().trim().max(60).optional(),
    lampType: z.string().trim().max(40).optional(),
    wattage: z.number().int().min(1).max(2000).optional(),
    installedAt: z.iso.datetime().optional(),
  })
  .meta({ id: 'CreatePoleRequest' });

export const updatePoleSchema = createPoleSchema
  .extend({
    zoneId: z.uuid().nullable(),
    assetStatus: z.enum(['ACTIVE', 'DECOMMISSIONED']),
  })
  .partial()
  .meta({ id: 'UpdatePoleRequest' });

/** Minimal shape for drawing thousands of poles on the live map. */
export const poleMapItemSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    lightStatus: lightStatusSchema,
  })
  .meta({ id: 'PoleMapItem' });

/** Optional bounding box: only poles inside the visible map area are returned. */
export const poleMapQuerySchema = z.object({
  zoneId: z.uuid().optional(),
  tenantId: z.uuid().optional(),
  minLat: z.coerce.number().min(-90).max(90).optional(),
  maxLat: z.coerce.number().min(-90).max(90).optional(),
  minLng: z.coerce.number().min(-180).max(180).optional(),
  maxLng: z.coerce.number().min(-180).max(180).optional(),
});

/** Upper bound on poles per map request (clients zoom in for more detail). */
export const POLE_MAP_LIMIT = 20_000;

// ─── Devices ──────────────────────────────────────────────────────────────────

export const commissionDeviceSchema = z
  .object({
    /** Scanned from the pole's QR plate. */
    poleCode: z.string().trim().min(5).max(20),
    /** Scanned from the controller's QR label. */
    deviceId: z.string().regex(MQTT_ID_PATTERN).meta({ example: 'sl-000123' }),
    serialNumber: z.string().trim().max(60).optional(),
    firmwareVersion: z.string().trim().max(32).optional(),
  })
  .meta({ id: 'CommissionDeviceRequest' });

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const statusCountsSchema = z.object({
  total: z.number().int(),
  /** ON + DIMMED + OFF (off during the day is normal). */
  working: z.number().int(),
  fault: z.number().int(),
  offline: z.number().int(),
  /** Poles without a reporting controller. */
  unknown: z.number().int(),
});

export const dashboardSummarySchema = z
  .object({
    poles: statusCountsSchema,
    devices: z.object({ total: z.number().int(), online: z.number().int() }),
    zones: z.array(statusCountsSchema.extend({ id: z.uuid(), code: z.string(), name: z.string() })),
  })
  .meta({ id: 'DashboardSummary' });

export type DashboardSummaryDto = z.infer<typeof dashboardSummarySchema>;
