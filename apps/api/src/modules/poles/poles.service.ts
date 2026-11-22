import type { Prisma } from '@smart-light/db';
import {
  formatPoleCode,
  parsePoleCode,
  type ApiErrorDetail,
  type createPoleSchema,
  type ImportPolesResult,
  type importPolesSchema,
  type listPolesQuerySchema,
  type PaginationMeta,
  type PoleDto,
  type poleMapQuerySchema,
  type updatePoleSchema,
} from '@smart-light/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import { nextCounterValue, reserveCounterRange } from '../../lib/counters';
import { paginationMeta, toSkipTake } from '../../lib/pagination';
import { prisma, type DbClient } from '../../lib/prisma';
import { toIso } from '../../lib/roles';
import { AppError } from '../../utils/app-error';
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

  /**
   * Bulk import (CSV upload). All rows are checked first and nothing is saved
   * unless every row is valid, so a file can simply be fixed and uploaded again.
   * Rows whose exact coordinates already exist (in the file or the city) are
   * rejected, which also stops the same file being imported twice.
   */
  async import(
    tenantId: string,
    input: z.output<typeof importPolesSchema>,
    auth: AuthContext,
    request: Request,
  ): Promise<ImportPolesResult> {
    const { rows } = input;
    const problems: ApiErrorDetail[] = [];
    const coordinateKey = (row: { latitude: number; longitude: number }) =>
      `${row.latitude.toFixed(6)},${row.longitude.toFixed(6)}`;

    const zoneCodes = [...new Set(rows.flatMap((row) => (row.zoneCode ? [row.zoneCode] : [])))];
    const zones = await prisma.zone.findMany({
      where: { tenantId, code: { in: zoneCodes } },
      select: { id: true, code: true },
    });
    const zoneIdByCode = new Map(zones.map((zone) => [zone.code, zone.id]));

    const existing = await prisma.pole.findMany({
      where: {
        tenantId,
        OR: rows.map((row) => ({ latitude: row.latitude, longitude: row.longitude })),
      },
      select: { code: true, latitude: true, longitude: true },
    });
    const existingByKey = new Map(existing.map((pole) => [coordinateKey(pole), pole.code]));

    const seen = new Map<string, number>();
    rows.forEach((row, index) => {
      if (row.zoneCode && !zoneIdByCode.has(row.zoneCode)) {
        problems.push({ field: `rows.${index}.zoneCode`, message: `Unknown zone ${row.zoneCode}` });
      }
      const key = coordinateKey(row);
      const already = existingByKey.get(key);
      if (already) {
        problems.push({
          field: `rows.${index}.latitude`,
          message: `Pole ${already} already exists at these coordinates`,
        });
      }
      const earlier = seen.get(key);
      if (earlier !== undefined) {
        problems.push({
          field: `rows.${index}.latitude`,
          message: `Same coordinates as row ${earlier + 1} of this batch`,
        });
      } else {
        seen.set(key, index);
      }
    });
    if (problems.length > 0) {
      throw new AppError({
        statusCode: 400,
        code: 'IMPORT_INVALID',
        message: 'Some rows could not be imported. Nothing was saved.',
        details: problems.slice(0, 100),
      });
    }

    return prisma.$transaction(
      async (tx) => {
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        const firstSerial = await reserveCounterRange(tx, tenantId, 'pole', rows.length);
        const created = await tx.pole.createManyAndReturn({
          data: rows.map((row, index) => {
            const serial = firstSerial + index;
            const { zoneCode, ...fields } = row;
            return {
              ...fields,
              tenantId,
              serial,
              code: formatPoleCode(tenant.code, serial),
              zoneId: zoneCode ? (zoneIdByCode.get(zoneCode) ?? null) : null,
            };
          }),
          select: { id: true, code: true, serial: true },
        });
        created.sort((a, b) => a.serial - b.serial);
        await recordAudit(
          {
            tenantId,
            actorType: 'USER',
            actorId: auth.userId,
            action: 'pole.import',
            entityType: 'pole',
            metadata: {
              count: created.length,
              firstCode: created[0]?.code,
              lastCode: created.at(-1)?.code,
            },
            request,
          },
          tx,
        );
        return {
          created: created.length,
          poles: created.map(({ id, code }) => ({ id, code })),
        };
      },
      { timeout: 30_000 },
    );
  },
};
