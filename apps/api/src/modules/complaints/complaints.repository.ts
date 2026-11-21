import type { Prisma } from '@smart-light/db';
import { prisma, type DbClient } from '../../lib/prisma';

export const complaintInclude = {
  tenant: { select: { slug: true, name: true, nameHi: true } },
  pole: { select: { code: true } },
  citizen: { select: { phone: true } },
  workOrder: {
    select: {
      number: true,
      slaDueAt: true,
      events: { select: { type: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
    },
  },
} satisfies Prisma.ComplaintInclude;

export type ComplaintWithRelations = Prisma.ComplaintGetPayload<{
  include: typeof complaintInclude;
}>;

export const complaintsRepository = {
  findByNumber(number: string, db: DbClient = prisma) {
    return db.complaint.findUnique({ where: { number }, include: complaintInclude });
  },

  findById(id: string, db: DbClient) {
    return db.complaint.findUnique({ where: { id }, include: complaintInclude });
  },

  listForCitizen(citizenId: string) {
    return prisma.complaint.findMany({
      where: { citizenId },
      include: complaintInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  async listForTenant(
    where: Prisma.ComplaintWhereInput,
    page: { skip: number; take: number },
  ): Promise<{ items: ComplaintWithRelations[]; total: number }> {
    const [items, total] = await Promise.all([
      prisma.complaint.findMany({
        where,
        include: complaintInclude,
        orderBy: { createdAt: 'desc' },
        ...page,
      }),
      prisma.complaint.count({ where }),
    ]);
    return { items, total };
  },

  countRecentByCitizen(citizenId: string, since: Date) {
    return prisma.complaint.count({ where: { citizenId, createdAt: { gte: since } } });
  },

  findOpenByCitizenAndPole(citizenId: string, poleId: string, db: DbClient) {
    return db.complaint.findFirst({
      where: { citizenId, poleId, status: { in: ['SUBMITTED', 'IN_PROGRESS'] } },
    });
  },

  /** Poles near a point (≈ 60 m box), for complaints filed without a pole code. */
  findPolesNear(tenantId: string, latitude: number, longitude: number) {
    const delta = 0.0006;
    return prisma.pole.findMany({
      where: {
        tenantId,
        assetStatus: 'ACTIVE',
        latitude: { gte: latitude - delta, lte: latitude + delta },
        longitude: { gte: longitude - delta, lte: longitude + delta },
      },
      select: { id: true, latitude: true, longitude: true },
      take: 50,
    });
  },

  create(data: Prisma.ComplaintUncheckedCreateInput, db: DbClient) {
    return db.complaint.create({ data });
  },
};
