import type { Prisma } from '@smart-light/db';
import { prisma, type DbClient } from '../../lib/prisma';

const userWithOrgInclude = {
  tenant: { select: { id: true, slug: true, code: true, name: true, nameHi: true, status: true } },
  agency: { select: { id: true, name: true, type: true } },
} satisfies Prisma.UserInclude;

export type UserWithOrg = Prisma.UserGetPayload<{ include: typeof userWithOrgInclude }>;

export const authRepository = {
  findUserByEmail(email: string): Promise<UserWithOrg | null> {
    return prisma.user.findUnique({ where: { email }, include: userWithOrgInclude });
  },

  findUserById(id: string): Promise<UserWithOrg | null> {
    return prisma.user.findUnique({ where: { id }, include: userWithOrgInclude });
  },

  recordFailedLogin(userId: string, lockUntil: Date | null): Promise<unknown> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: { increment: 1 },
        ...(lockUntil ? { lockedUntil: lockUntil } : {}),
      },
    });
  },

  recordSuccessfulLogin(userId: string): Promise<unknown> {
    return prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  },

  createSession(data: Prisma.SessionUncheckedCreateInput, db: DbClient = prisma) {
    return db.session.create({ data });
  },

  findSessionByTokenHash(tokenHash: string) {
    return prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { include: userWithOrgInclude } },
    });
  },

  /** Marks a session as rotated only if nobody rotated it concurrently. */
  async markRotated(sessionId: string, db: DbClient): Promise<boolean> {
    const result = await db.session.updateMany({
      where: { id: sessionId, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: new Date() },
    });
    return result.count === 1;
  },

  revokeSession(sessionId: string): Promise<unknown> {
    return prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  revokeFamily(familyId: string): Promise<unknown> {
    return prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
