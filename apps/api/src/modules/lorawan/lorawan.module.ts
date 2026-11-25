/**
 * LoRaWAN registry over HTTP:
 *   GET  /v1/lorawan/devices   radios fitted to controllers (AppKey never returned)
 *   POST /v1/lorawan/devices   register a controller's RAK3172 (admins)
 *   GET  /v1/gateways          gateways of the municipality
 *   POST /v1/gateways          register a gateway (admins)
 *
 * Registration here does not create the device in ChirpStack; that is a separate
 * step on the network server (see infra/lorawan/README.md).
 */
import { Prisma } from '@smart-light/db';
import {
  createGatewaySchema,
  gatewaySchema,
  lorawanDeviceSchema,
  registerLorawanDeviceSchema,
  successEnvelope,
  tenantScopeQuerySchema,
  type GatewayDto,
  type LorawanDeviceDto,
} from '@smart-light/shared';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendData } from '../../lib/http';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';
import { prisma } from '../../lib/prisma';
import { ROLE_GROUPS, toIso } from '../../lib/roles';
import {
  DeviceSecretKeyMissingError,
  deviceSecretFingerprint,
  sealDeviceSecret,
} from '../../lib/secret-box';
import { authenticate } from '../../middlewares/authenticate';
import { requireRoles } from '../../middlewares/authorize';
import { AppError } from '../../utils/app-error';
import { errors } from '../../utils/errors';
import { recordAudit } from '../audit/audit.service';
import { getAuth, requireTenantId } from '../auth/auth.context';

const deviceInclude = {
  interface: {
    select: {
      lastRssiDbm: true,
      lastSnrDb: true,
      device: { select: { id: true, deviceId: true, pole: { select: { code: true } } } },
    },
  },
} satisfies Prisma.LorawanDeviceInclude;

type DeviceRow = Prisma.LorawanDeviceGetPayload<{ include: typeof deviceInclude }>;

/** Explicit field list: the encrypted AppKey and its fingerprint never leave here. */
function toDeviceDto(row: DeviceRow): LorawanDeviceDto {
  return {
    id: row.id,
    devEui: row.devEui,
    joinEui: row.joinEui,
    appKeySet: row.appKeyEncrypted !== null,
    deviceProfile: row.deviceProfile,
    macVersion: row.macVersion,
    region: row.region,
    activation: row.activation,
    deviceClass: row.deviceClass,
    joinStatus: row.joinStatus,
    joinedAt: toIso(row.joinedAt),
    lastFCntUp: row.lastFCntUp,
    lastUplinkAt: toIso(row.lastUplinkAt),
    lastRssiDbm: row.interface.lastRssiDbm,
    lastSnrDb: row.interface.lastSnrDb,
    isSimulated: row.isSimulated,
    controller: {
      id: row.interface.device.id,
      deviceId: row.interface.device.deviceId,
      poleCode: row.interface.device.pole?.code ?? null,
    },
  };
}

function toGatewayDto(row: Prisma.GatewayGetPayload<object>): GatewayDto {
  return {
    id: row.id,
    gatewayEui: row.gatewayEui,
    name: row.name,
    network: row.network,
    manufacturer: row.manufacturer,
    model: row.model,
    backhaul: row.backhaul,
    latitude: row.latitude,
    longitude: row.longitude,
    online: row.online,
    lastSeenAt: toIso(row.lastSeenAt),
    isSimulated: row.isSimulated,
  };
}

function conflictTarget(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return JSON.stringify(error.meta ?? {});
  }
  return null;
}

const ADMINS = ROLE_GROUPS.admins;

export const lorawanRouter = Router();
lorawanRouter.use(authenticate);

lorawanRouter.get(
  '/devices',
  requireRoles(...ROLE_GROUPS.tenantManagers),
  async (req: Request, res: Response) => {
    const tenantId = requireTenantId(
      getAuth(res),
      tenantScopeQuerySchema.parse(req.query).tenantId,
    );
    const rows = await prisma.lorawanDevice.findMany({
      where: { interface: { device: { tenantId } } },
      include: deviceInclude,
      orderBy: { createdAt: 'desc' },
    });
    sendData(res, rows.map(toDeviceDto));
  },
);

lorawanRouter.post('/devices', requireRoles(...ADMINS), async (req: Request, res: Response) => {
  const auth = getAuth(res);
  const input = registerLorawanDeviceSchema.parse(req.body);
  const tenantId = requireTenantId(auth, tenantScopeQuerySchema.parse(req.query).tenantId);
  const controller = await prisma.device.findFirst({ where: { id: input.deviceId, tenantId } });
  if (!controller) {
    throw errors.notFound('Controller');
  }
  let sealed: string;
  let fingerprint: string;
  try {
    sealed = sealDeviceSecret(input.appKey);
    fingerprint = deviceSecretFingerprint(input.appKey);
  } catch (error) {
    if (error instanceof DeviceSecretKeyMissingError) {
      throw new AppError({
        statusCode: 503,
        code: 'DEVICE_SECRET_KEY_MISSING',
        message: 'Device secret storage is not configured on this server',
      });
    }
    throw error;
  }
  try {
    const created = await prisma.deviceInterface.create({
      data: {
        deviceId: controller.id,
        kind: 'LORAWAN',
        identifier: input.devEui,
        priority: input.priority,
        lorawan: {
          create: {
            devEui: input.devEui,
            joinEui: input.joinEui,
            appKeyEncrypted: sealed,
            appKeyFingerprint: fingerprint,
            deviceProfile: input.deviceProfile,
            macVersion: input.macVersion,
            deviceClass: input.deviceClass,
            isSimulated: input.isSimulated,
          },
        },
      },
      select: { lorawan: { include: deviceInclude } },
    });
    await recordAudit({
      tenantId,
      actorType: 'USER',
      actorId: auth.userId,
      action: 'lorawan.device_registered',
      entityType: 'device',
      entityId: controller.id,
      metadata: { devEui: input.devEui, simulated: input.isSimulated },
      request: req,
    });
    sendData(res, toDeviceDto(created.lorawan as DeviceRow), 201);
  } catch (error) {
    const target = conflictTarget(error);
    if (target?.includes('appKeyFingerprint')) {
      throw errors.conflict('APPKEY_REUSED', 'This AppKey is already used by another device');
    }
    if (target) {
      throw errors.conflict(
        'LORAWAN_DEVICE_EXISTS',
        'This DevEUI, or a LoRaWAN link on this controller, is already registered',
      );
    }
    throw error;
  }
});

export const gatewaysRouter = Router();
gatewaysRouter.use(authenticate);

gatewaysRouter.get(
  '/',
  requireRoles(...ROLE_GROUPS.tenantManagers),
  async (req: Request, res: Response) => {
    const tenantId = requireTenantId(
      getAuth(res),
      tenantScopeQuerySchema.parse(req.query).tenantId,
    );
    const rows = await prisma.gateway.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
    sendData(res, rows.map(toGatewayDto));
  },
);

gatewaysRouter.post('/', requireRoles(...ADMINS), async (req: Request, res: Response) => {
  const auth = getAuth(res);
  const input = createGatewaySchema.parse(req.body);
  const tenantId = requireTenantId(auth, tenantScopeQuerySchema.parse(req.query).tenantId);
  try {
    const row = await prisma.gateway.create({ data: { ...input, tenantId } });
    await recordAudit({
      tenantId,
      actorType: 'USER',
      actorId: auth.userId,
      action: 'gateway.registered',
      entityType: 'gateway',
      entityId: row.id,
      metadata: { gatewayEui: row.gatewayEui, simulated: row.isSimulated },
      request: req,
    });
    sendData(res, toGatewayDto(row), 201);
  } catch (error) {
    if (conflictTarget(error)) {
      throw errors.conflict('GATEWAY_EXISTS', 'A gateway with this EUI is already registered');
    }
    throw error;
  }
});

const TAG = 'LoRaWAN';
registry.registerPath({
  method: 'get',
  path: '/api/v1/lorawan/devices',
  tags: [TAG],
  summary: 'LoRaWAN radios of the municipality (AppKeys are never returned)',
  security: AUTHENTICATED,
  request: { query: tenantScopeQuerySchema },
  responses: {
    200: {
      description: 'Devices',
      content: jsonContent(successEnvelope(z.array(lorawanDeviceSchema))),
    },
    ...errorResponses(401, 403),
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/lorawan/devices',
  tags: [TAG],
  summary: 'Register a controller’s LoRaWAN radio for OTAA (admins)',
  description:
    'Stores DevEUI, JoinEUI and the AppKey (encrypted, unique per device). Does not create ' +
    'the device on the network server.',
  security: AUTHENTICATED,
  request: {
    query: tenantScopeQuerySchema,
    body: { content: jsonContent(registerLorawanDeviceSchema) },
  },
  responses: {
    201: { description: 'Registered', content: jsonContent(successEnvelope(lorawanDeviceSchema)) },
    ...errorResponses(400, 401, 403, 404, 409),
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/gateways',
  tags: [TAG],
  summary: 'Gateways of the municipality',
  security: AUTHENTICATED,
  request: { query: tenantScopeQuerySchema },
  responses: {
    200: { description: 'Gateways', content: jsonContent(successEnvelope(z.array(gatewaySchema))) },
    ...errorResponses(401, 403),
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/gateways',
  tags: [TAG],
  summary: 'Register a gateway (admins)',
  security: AUTHENTICATED,
  request: { query: tenantScopeQuerySchema, body: { content: jsonContent(createGatewaySchema) } },
  responses: {
    201: { description: 'Registered', content: jsonContent(successEnvelope(gatewaySchema)) },
    ...errorResponses(400, 401, 403, 409),
  },
});
