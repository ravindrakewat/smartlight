import type { Prisma, Tenant } from '@smart-light/db';
import { prisma, type DbClient } from '../../lib/prisma';

export interface TenantStats {
  poles: number;
  devices: number;
  devicesOnline: number;
  users: number;
}

export const EMPTY_TENANT_STATS: TenantStats = { poles: 0, devices: 0, devicesOnline: 0, users: 0 };

export const tenantsRepository = {
  findAll(): Promise<Tenant[]> {
    return prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } });
  },

  findBySlug(slug: string): Promise<Tenant | null> {
    return prisma.tenant.findUnique({ where: { slug } });
  },

  create(data: Prisma.TenantCreateInput, db: DbClient): Promise<Tenant> {
    return db.tenant.create({ data });
  },

  update(id: string, data: Prisma.TenantUpdateInput, db: DbClient): Promise<Tenant> {
    return db.tenant.update({ where: { id }, data });
  },

  /** Pole, controller and user counts per tenant in three grouped queries. */
  async statsByTenant(): Promise<Map<string, TenantStats>> {
    const [poles, devices, users] = await Promise.all([
      prisma.pole.groupBy({ by: ['tenantId'], _count: { _all: true } }),
      prisma.device.groupBy({ by: ['tenantId', 'online'], _count: { _all: true } }),
      prisma.user.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    ]);
    const stats = new Map<string, TenantStats>();
    const entryFor = (id: string): TenantStats => {
      let entry = stats.get(id);
      if (!entry) {
        entry = { ...EMPTY_TENANT_STATS };
        stats.set(id, entry);
      }
      return entry;
    };
    for (const row of poles) {
      entryFor(row.tenantId).poles = row._count._all;
    }
    for (const row of devices) {
      const entry = entryFor(row.tenantId);
      entry.devices += row._count._all;
      if (row.online) {
        entry.devicesOnline += row._count._all;
      }
    }
    for (const row of users) {
      if (row.tenantId) {
        entryFor(row.tenantId).users = row._count._all;
      }
    }
    return stats;
  },
};
