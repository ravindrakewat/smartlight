import { z } from 'zod';

const eui64 = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{16}$/, { error: '16 hexadecimal characters' })
  .transform((value) => value.toLowerCase());

/** Register a controller's RAK3172 for OTAA. The AppKey is write-only. */
export const registerLorawanDeviceSchema = z
  .object({
    /** The controller (devices.id) this radio is fitted to. */
    deviceId: z.uuid(),
    devEui: eui64,
    joinEui: eui64,
    /** 128-bit AppKey, 32 hex characters, unique per device. Never returned. */
    appKey: z
      .string()
      .trim()
      .regex(/^[0-9a-fA-F]{32}$/, { error: '32 hexadecimal characters' })
      .refine((value) => !/^(.)\1{31}$/.test(value), { error: 'Use a random key' })
      .transform((value) => value.toLowerCase()),
    deviceProfile: z.string().trim().min(1).max(100),
    macVersion: z.string().trim().max(10).default('1.0.3'),
    deviceClass: z.enum(['A', 'C']).default('A'),
    /** Lower = preferred for commands; default keeps 4G / Wi-Fi first. */
    priority: z.number().int().min(0).max(1000).default(200),
    /** Simulator registration: no radio. Shown as simulated everywhere. */
    isSimulated: z.boolean().default(false),
  })
  .meta({ id: 'RegisterLorawanDeviceRequest' });

export const lorawanDeviceSchema = z
  .object({
    id: z.uuid(),
    devEui: z.string(),
    joinEui: z.string(),
    appKeySet: z.boolean(),
    deviceProfile: z.string(),
    macVersion: z.string(),
    region: z.string(),
    activation: z.string(),
    deviceClass: z.string(),
    joinStatus: z.string(),
    joinedAt: z.iso.datetime().nullable(),
    lastFCntUp: z.number().int().nullable(),
    lastUplinkAt: z.iso.datetime().nullable(),
    lastRssiDbm: z.number().int().nullable(),
    lastSnrDb: z.number().nullable(),
    isSimulated: z.boolean(),
    controller: z.object({
      id: z.uuid(),
      deviceId: z.string(),
      poleCode: z.string().nullable(),
    }),
  })
  .meta({ id: 'LorawanDevice' });
export type LorawanDeviceDto = z.infer<typeof lorawanDeviceSchema>;

export const createGatewaySchema = z
  .object({
    gatewayEui: eui64,
    name: z.string().trim().min(2).max(100),
    manufacturer: z.string().trim().max(100).optional(),
    model: z.string().trim().max(100).optional(),
    backhaul: z.enum(['ethernet', 'wifi', 'cellular']).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    isSimulated: z.boolean().default(false),
  })
  .meta({ id: 'CreateGatewayRequest' });

export const gatewaySchema = z
  .object({
    id: z.uuid(),
    gatewayEui: z.string(),
    name: z.string(),
    network: z.string(),
    manufacturer: z.string().nullable(),
    model: z.string().nullable(),
    backhaul: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    online: z.boolean(),
    lastSeenAt: z.iso.datetime().nullable(),
    isSimulated: z.boolean(),
  })
  .meta({ id: 'Gateway' });
export type GatewayDto = z.infer<typeof gatewaySchema>;

export const tenantScopeQuerySchema = z.object({ tenantId: z.uuid().optional() });
