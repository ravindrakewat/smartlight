import type { Prisma } from '@smart-light/db';
import {
  formatPoleCode,
  parsePoleCode,
  type createPoleSchema,
  type listPolesQuerySchema,
  type PaginationMeta,
  type PoleDto,
  type poleMapQuerySchema,
  type updatePoleSchema,
} from '@smart-light/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import { nextCounterValue } from '../../lib/counters';
import { paginationMeta, toSkipTake } from '../../lib/pagination';
import { prisma, type DbClient } from '../../lib/prisma';
import { toIso } from '../../lib/roles';
import { errors } from '../../utils/errors';
import { recordAudit } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.context';
import { polesRepository, type PoleWithRelations } from './poles.repository';

export function toPoleDto(pole: PoleWithRelations): PoleDto {
  return {
    id: pole.id,
    code: pole.code,
    latitude: pole.latitude,
    longitude: pole.longitude,
    address: pole.address,
    ward: pole.ward,
    lampType: pole.lampType,
    wattage: pole.wattage,
    installedAt: toIso(pole.installedAt),
    assetStatus: pole.assetStatus,
    lightStatus: pole.lightStatus,
    lightStatusAt: toIso(pole.lightStatusAt),
    zone: pole.zone,
    device: pole.device
      ? {
          deviceId: pole.device.deviceId,
          online: pole.device.online,
          lastSeenAt: toIso(pole.device.lastSeenAt),
          firmwareVersion: pole.device.firmwareVersion,
        }
      : null,
  };
}

async function assertZoneInTenant(
  db: DbClient,
  zoneId: string | null | undefined,
  tenantId: string,
): Promise<void> {
  if (zoneId && !(await db.zone.findFirst({ where: { id: zoneId, tenantId } }))) {
    throw errors.badRequest('INVALID_ZONE', 'Zone not found in this municipality');
  }
}

/** Finds a pole by its printed code within the tenant (lenient input, check digit verified). */
export async function findPoleByCodeInTenant(
  rawCode: string,
  tenantId: string,
  db: DbClient = prisma,
): Promise<PoleWithRelations> {
  const parsed = parsePoleCode(rawCode);
  if (!parsed) {
    throw errors.badRequest('INVALID_POLE_CODE', 'Pole code is not valid (check the number)');
  }
  const pole = await polesRepository.findByCode(parsed.code, db);
  if (!pole || pole.tenantId !== tenantId) {
    throw errors.notFound('Pole');
  }
  return pole;
}

export const polesService = {
  async list(
    tenantId: string,
    query: z.output<typeof listPolesQuerySchema>,
  ): Promise<{ items: PoleDto[]; pagination: PaginationMeta }> {
    const where: Prisma.PoleWhereInput = {
      tenantId,
      ...(query.zoneId ? { zoneId: query.zoneId } : {}),
      ...(query.lightStatus ? { lightStatus: query.lightStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search.toUpperCase() } },
              { address: { contains: query.search, mode: 'insensitive' } },
              { ward: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const { items, total } = await polesRepository.list(where, toSkipTake(query));
    return { items: items.map(toPoleDto), pagination: paginationMeta(query, total) };
  },

  async get(tenantId: string, id: string): Promise<PoleDto> {
    const pole = await polesRepository.findInTenant(id, tenantId);
    if (!pole) {
      throw errors.notFound('Pole');
    }
    return toPoleDto(pole);
  },

  async getByCode(tenantId: string, code: string): Promise<PoleDto> {
    return toPoleDto(await findPoleByCodeInTenant(code, tenantId));
  },

  async map(tenantId: string, query: z.output<typeof poleMapQuerySchema>) {
    return polesRepository.mapItems({
      tenantId,
      assetStatus: 'ACTIVE',
      ...(query.zoneId ? { zoneId: query.zoneId } : {}),
      ...(query.minLat !== undefined && query.maxLat !== undefined
        ? { latitude: { gte: query.minLat, lte: query.maxLat } }
        : {}),
      ...(query.minLng !== undefined && query.maxLng !== undefined
        ? { longitude: { gte: query.minLng, lte: query.maxLng } }
        : {}),
    });
  },

  async create(
    tenantId: string,
    input: z.output<typeof createPoleSchema>,
    auth: AuthContext,
    request: Request,
  ): Promise<PoleDto> {
    return prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      await assertZoneInTenant(tx, input.zoneId, tenantId);
      const serial = await nextCounterValue(tx, tenantId, 'pole');
      const pole = await polesRepository.create(
        {
          ...input,
          installedAt: input.installedAt ? new Date(input.installedAt) : null,
          tenantId,
          serial,
          code: formatPoleCode(tenant.code, serial),
        },
        tx,
      );
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: auth.userId,
          action: 'pole.create',
          entityType: 'pole',
          entityId: pole.id,
          metadata: { code: pole.code },
          request,
        },
        tx,
      );
      return toPoleDto(pole);
    });
  },

  async update(
    tenantId: string,
    id: string,
    input: z.output<typeof updatePoleSchema>,
    auth: AuthContext,
    request: Request,
  ): Promise<PoleDto> {
    return prisma.$transaction(async (tx) => {
      if (!(await polesRepository.findInTenant(id, tenantId, tx))) {
        throw errors.notFound('Pole');
      }
      await assertZoneInTenant(tx, input.zoneId, tenantId);
      const { installedAt, ...rest } = input;
      const pole = await polesRepository.update(
        id,
        {
          ...rest,
          ...(installedAt !== undefined ? { installedAt: new Date(installedAt) } : {}),
        },
        tx,
      );
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: auth.userId,
          action: 'pole.update',
          entityType: 'pole',
          entityId: id,
          metadata: input,
          request,
        },
        tx,
      );
      return toPoleDto(pole);
    });
  },
};
