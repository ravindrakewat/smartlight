import type { Prisma, Tenant } from '@smart-light/db';
import type { LightStatusName } from '@smart-light/shared';
import { prisma, type DbClient } from '../../lib/prisma';

export interface TenantStats {
  poles: number;
  devices: number;
  devicesOnline: number;
  users: number;
  lights: Partial<Record<LightStatusName, number>>;
  openWorkOrders: number;
}

/** A fresh, zeroed stats object (never shared, so it is safe to mutate). */
export function emptyTenantStats(): TenantStats {
  return { poles: 0, devices: 0, devicesOnline: 0, users: 0, lights: {}, openWorkOrders: 0 };
}

const OPEN_WORK_ORDER_STATUSES = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'PENDING_VERIFICATION',
] as const;

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

  /** Pole, light, controller, user and open-job counts per tenant in grouped queries. */
  async statsByTenant(): Promise<Map<string, TenantStats>> {
    const [poles, devices, users, workOrders] = await Promise.all([
      prisma.pole.groupBy({ by: ['tenantId', 'lightStatus'], _count: { _all: true } }),
      prisma.device.groupBy({ by: ['tenantId', 'online'], _count: { _all: true } }),
      prisma.user.groupBy({ by: ['tenantId'], _count: { _all: true } }),
      prisma.workOrder.groupBy({
        by: ['tenantId'],
        where: { status: { in: [...OPEN_WORK_ORDER_STATUSES] } },
        _count: { _all: true },
      }),
    ]);
    const stats = new Map<string, TenantStats>();
    const entryFor = (id: string): TenantStats => {
      let entry = stats.get(id);
      if (!entry) {
        entry = emptyTenantStats();
        stats.set(id, entry);
      }
      return entry;
    };
    for (const row of poles) {
      const entry = entryFor(row.tenantId);
      entry.poles += row._count._all;
      entry.lights[row.lightStatus] = row._count._all;
    }
    for (const row of workOrders) {
      entryFor(row.tenantId).openWorkOrders = row._count._all;
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
