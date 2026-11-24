import type { Prisma } from '@smart-light/db';
import { POLE_MAP_LIMIT } from '@smart-light/shared';
import { prisma, type DbClient } from '../../lib/prisma';

export const poleInclude = {
  zone: { select: { id: true, code: true, name: true } },
  device: { select: { deviceId: true, online: true, lastSeenAt: true, firmwareVersion: true } },
} satisfies Prisma.PoleInclude;

export type PoleWithRelations = Prisma.PoleGetPayload<{ include: typeof poleInclude }>;

export const polesRepository = {
  async list(
    where: Prisma.PoleWhereInput,
    page: { skip: number; take: number },
  ): Promise<{ items: PoleWithRelations[]; total: number }> {
    const [items, total] = await Promise.all([
      prisma.pole.findMany({ where, include: poleInclude, orderBy: { serial: 'asc' }, ...page }),
      prisma.pole.count({ where }),
    ]);
    return { items, total };
  },

  findInTenant(id: string, tenantId: string, db: DbClient = prisma) {
    return db.pole.findFirst({ where: { id, tenantId }, include: poleInclude });
  },

  findByCode(code: string, db: DbClient = prisma) {
    return db.pole.findUnique({ where: { code }, include: poleInclude });
  },

  mapItems(where: Prisma.PoleWhereInput) {
    return prisma.pole.findMany({
      where,
      select: {
        id: true,
        code: true,
        latitude: true,
        longitude: true,
        lightStatus: true,
        zoneId: true,
        device: { select: { dimPercent: true } },
      },
      orderBy: { serial: 'asc' },
      take: POLE_MAP_LIMIT,
    });
  },

  create(data: Prisma.PoleUncheckedCreateInput, db: DbClient) {
    return db.pole.create({ data, include: poleInclude });
  },

  update(id: string, data: Prisma.PoleUncheckedUpdateInput, db: DbClient) {
    return db.pole.update({ where: { id }, data, include: poleInclude });
  },
};
