import type { Prisma } from '@smart-light/db';
import { prisma, type DbClient } from '../../lib/prisma';

const userInclude = { agency: { select: { id: true, name: true } } } satisfies Prisma.UserInclude;

export type UserWithAgency = Prisma.UserGetPayload<{ include: typeof userInclude }>;

export const usersRepository = {
  async list(
    where: Prisma.UserWhereInput,
    page: { skip: number; take: number },
  ): Promise<{ items: UserWithAgency[]; total: number }> {
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: userInclude,
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        ...page,
      }),
      prisma.user.count({ where }),
    ]);
    return { items, total };
  },

  findById(id: string, db: DbClient = prisma): Promise<UserWithAgency | null> {
    return db.user.findUnique({ where: { id }, include: userInclude });
  },

  create(data: Prisma.UserUncheckedCreateInput, db: DbClient): Promise<UserWithAgency> {
    return db.user.create({ data, include: userInclude });
  },

  update(id: string, data: Prisma.UserUncheckedUpdateInput, db: DbClient): Promise<UserWithAgency> {
    return db.user.update({ where: { id }, data, include: userInclude });
  },

  revokeAllSessions(userId: string, db: DbClient): Promise<unknown> {
    return db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
