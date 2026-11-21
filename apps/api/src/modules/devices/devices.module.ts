/**
 * Devices: commissioning a street-light controller onto a pole.
 * The technician scans the pole's QR plate and the controller's label; the API
 * links them, moving the controller if it was installed elsewhere before.
 */
import { commissionDeviceSchema, poleSchema, successEnvelope } from '@smart-light/shared';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendData } from '../../lib/http';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../middlewares/authenticate';
import { requireRoles } from '../../middlewares/authorize';
import { errors } from '../../utils/errors';
import { recordAudit } from '../audit/audit.service';
import { getAuth, requireTenantId } from '../auth/auth.context';
import { polesRepository } from '../poles/poles.repository';
import { findPoleByCodeInTenant, toPoleDto } from '../poles/poles.service';

// ── Service ──
const devicesService = {
  async commission(
    tenantId: string,
    input: z.output<typeof commissionDeviceSchema>,
    userId: string,
    request: Request,
  ) {
    return prisma.$transaction(async (tx) => {
      const pole = await findPoleByCodeInTenant(input.poleCode, tenantId, tx);
      if (pole.assetStatus !== 'ACTIVE') {
        throw errors.badRequest('POLE_DECOMMISSIONED', 'This pole is decommissioned');
      }

      const existing = await tx.device.findUnique({ where: { deviceId: input.deviceId } });
      if (existing && existing.tenantId !== tenantId) {
        throw errors.conflict(
          'DEVICE_OTHER_TENANT',
          'This controller belongs to another municipality',
        );
      }

      // A pole carries one controller: detach whatever was there before.
      await tx.device.updateMany({
        where: { poleId: pole.id, NOT: { deviceId: input.deviceId } },
        data: { poleId: null },
      });

      const device = await tx.device.upsert({
        where: { deviceId: input.deviceId },
        create: {
          tenantId,
          poleId: pole.id,
          deviceId: input.deviceId,
          serialNumber: input.serialNumber ?? null,
          firmwareVersion: input.firmwareVersion ?? null,
        },
        update: {
          poleId: pole.id,
          ...(input.serialNumber ? { serialNumber: input.serialNumber } : {}),
          ...(input.firmwareVersion ? { firmwareVersion: input.firmwareVersion } : {}),
        },
      });

      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: userId,
          action: 'device.commission',
          entityType: 'device',
          entityId: device.id,
          metadata: {
            deviceId: device.deviceId,
            poleCode: pole.code,
            previousPoleId: existing?.poleId ?? null,
          },
          request,
        },
        tx,
      );

      const updatedPole = await polesRepository.findInTenant(pole.id, tenantId, tx);
      return toPoleDto(updatedPole ?? pole);
    });
  },
};

// ── Controller ──
const tenantQuery = z.object({ tenantId: z.uuid().optional() });

const devicesController = {
  async commission(req: Request, res: Response): Promise<void> {
    const auth = getAuth(res);
    const tenantId = requireTenantId(auth, tenantQuery.parse(req.query).tenantId);
    const input = commissionDeviceSchema.parse(req.body);
    sendData(res, await devicesService.commission(tenantId, input, auth.userId, req));
  },
};

// ── Routes ──
export const devicesRouter = Router();
devicesRouter.post(
  '/commission',
  authenticate,
  requireRoles('SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'SUPERVISOR', 'TECHNICIAN'),
  devicesController.commission,
);

registry.registerPath({
  method: 'post',
  path: '/api/v1/devices/commission',
  tags: ['Assets'],
  summary: 'Install a controller on a pole (scan pole QR + controller label)',
  security: AUTHENTICATED,
  request: { query: tenantQuery, body: { content: jsonContent(commissionDeviceSchema) } },
  responses: {
    200: {
      description: 'Pole with its controller',
      content: jsonContent(successEnvelope(poleSchema)),
    },
    ...errorResponses(400, 401, 403, 404, 409),
  },
});
