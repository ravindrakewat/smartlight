import type { Prisma } from '@smart-light/db';
import { prisma, type DbClient } from '../../lib/prisma';

const agencyInclude = {
  _count: { select: { users: { where: { role: 'TECHNICIAN', status: 'ACTIVE' } } } },
} satisfies Prisma.AgencyInclude;

export type AgencyWithCount = Prisma.AgencyGetPayload<{ include: typeof agencyInclude }>;

export const agenciesRepository = {
  list(tenantId: string, onlyAgencyId?: string): Promise<AgencyWithCount[]> {
    return prisma.agency.findMany({
      where: { tenantId, ...(onlyAgencyId ? { id: onlyAgencyId } : {}) },
      include: agencyInclude,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  },

  findInTenant(id: string, tenantId: string, db: DbClient = prisma) {
    return db.agency.findFirst({ where: { id, tenantId } });
  },

  create(data: Prisma.AgencyUncheckedCreateInput, db: DbClient): Promise<AgencyWithCount> {
    return db.agency.create({ data, include: agencyInclude });
  },

  update(id: string, data: Prisma.AgencyUpdateInput, db: DbClient): Promise<AgencyWithCount> {
    return db.agency.update({ where: { id }, data, include: agencyInclude });
  },
};
