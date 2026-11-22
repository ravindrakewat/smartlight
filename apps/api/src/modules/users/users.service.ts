import { hashPassword, type Prisma } from '@smart-light/db';
import type {
  createUserSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  PaginationMeta,
  StaffUserDto,
  updateUserSchema,
  UserRoleName,
} from '@smart-light/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import { paginationMeta, toSkipTake } from '../../lib/pagination';
import { prisma, type DbClient } from '../../lib/prisma';
import { toIso } from '../../lib/roles';
import { errors } from '../../utils/errors';
import { agenciesRepository } from '../agencies/agencies.repository';
import { recordAudit } from '../audit/audit.service';
import { requireTenantId, type AuthContext } from '../auth/auth.context';
import { usersRepository, type UserWithAgency } from './users.repository';

const AGENCY_ROLES = new Set<UserRoleName>(['AGENCY_MANAGER', 'TECHNICIAN']);

function toDto(user: UserWithAgency): StaffUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    tenantId: user.tenantId,
    agency: user.agency,
    lastLoginAt: toIso(user.lastLoginAt),
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Who may manage whom:
 * - SUPER_ADMIN and MUNICIPAL_ADMIN: any tenant role.
 * - AGENCY_MANAGER: technicians of their own agency only.
 */
function assertCanManage(auth: AuthContext, role: UserRoleName, agencyId: string | null): void {
  if (auth.role === 'SUPER_ADMIN' || auth.role === 'MUNICIPAL_ADMIN') {
    return;
  }
  if (auth.role === 'AGENCY_MANAGER' && role === 'TECHNICIAN' && agencyId === auth.agencyId) {
    return;
  }
  throw errors.forbidden('You cannot manage users with this role');
}

async function assertAgencyRules(
  db: DbClient,
  tenantId: string,
  role: UserRoleName,
  agencyId: string | null,
): Promise<void> {
  if (AGENCY_ROLES.has(role)) {
    if (!agencyId) {
      throw errors.badRequest('AGENCY_REQUIRED', 'Technicians and agency managers need an agency');
    }
    const agency = await agenciesRepository.findInTenant(agencyId, tenantId, db);
    if (!agency || !agency.active) {
      throw errors.badRequest('INVALID_AGENCY', 'Agency not found or inactive');
    }
  } else if (agencyId) {
    throw errors.badRequest(
      'AGENCY_NOT_ALLOWED',
      'Only technicians and agency managers belong to an agency',
    );
  }
}

export const usersService = {
  async list(
    query: z.output<typeof listUsersQuerySchema>,
    auth: AuthContext,
  ): Promise<{ items: StaffUserDto[]; pagination: PaginationMeta }> {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.agencyId ? { agencyId: query.agencyId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    if (auth.role === 'SUPER_ADMIN') {
      if (query.tenantId) {
        where.tenantId = query.tenantId;
      }
    } else {
      where.tenantId = requireTenantId(auth);
      if (auth.role === 'AGENCY_MANAGER') {
        where.agencyId = auth.agencyId;
      }
    }

    const { items, total } = await usersRepository.list(where, toSkipTake(query));
    return { items: items.map(toDto), pagination: paginationMeta(query, total) };
  },

  async create(
    input: z.output<typeof createUserSchema>,
    auth: AuthContext,
    request: Request,
  ): Promise<StaffUserDto> {
    const tenantId = requireTenantId(auth, input.tenantId);
    const agencyId = input.agencyId ?? null;
    assertCanManage(auth, input.role, agencyId);
    const passwordHash = await hashPassword(input.password);

    return prisma.$transaction(async (tx) => {
      await assertAgencyRules(tx, tenantId, input.role, agencyId);
      const user = await usersRepository.create(
        {
          tenantId,
          agencyId,
          role: input.role,
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          passwordHash,
        },
        tx,
      );
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: auth.userId,
          action: 'user.create',
          entityType: 'user',
          entityId: user.id,
          metadata: { role: user.role, email: user.email },
          request,
        },
        tx,
      );
      return toDto(user);
    });
  },

  async update(
    id: string,
    input: z.output<typeof updateUserSchema>,
    auth: AuthContext,
    request: Request,
  ): Promise<StaffUserDto> {
    if (id === auth.userId && (input.role || input.status || input.agencyId !== undefined)) {
      throw errors.forbidden('You cannot change your own role, status or agency');
    }

    return prisma.$transaction(async (tx) => {
      const existing = await usersRepository.findById(id, tx);
      if (
        !existing ||
        existing.role === 'SUPER_ADMIN' ||
        (auth.role !== 'SUPER_ADMIN' && existing.tenantId !== auth.tenantId)
      ) {
        throw errors.notFound('User');
      }
      const tenantId = existing.tenantId as string;
      const nextRole = input.role ?? existing.role;
      const nextAgencyId = input.agencyId !== undefined ? input.agencyId : existing.agencyId;

      // Must be allowed to manage the user both before and after the change.
      assertCanManage(auth, existing.role, existing.agencyId);
      assertCanManage(auth, nextRole, nextAgencyId);
      await assertAgencyRules(tx, tenantId, nextRole, nextAgencyId);

      const user = await usersRepository.update(
        id,
        {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          role: nextRole,
          agencyId: nextAgencyId,
        },
        tx,
      );
      // Disabling or re-roling someone signs them out everywhere immediately.
      if (input.status === 'DISABLED' || (input.role && input.role !== existing.role)) {
        await usersRepository.revokeAllSessions(id, tx);
      }
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: auth.userId,
          action: input.status === 'DISABLED' ? 'user.disable' : 'user.update',
          entityType: 'user',
          entityId: id,
          metadata: input,
          request,
        },
        tx,
      );
      return toDto(user);
    });
  },

  /**
   * Sets a new password chosen by a manager, unlocks the account and signs the
   * user out everywhere. People change their own password themselves instead.
   */
  async resetPassword(
    id: string,
    input: z.output<typeof resetPasswordSchema>,
    auth: AuthContext,
    request: Request,
  ): Promise<void> {
    if (id === auth.userId) {
      throw errors.forbidden('Use "change password" for your own account');
    }
    const passwordHash = await hashPassword(input.password);
    await prisma.$transaction(async (tx) => {
      const existing = await usersRepository.findById(id, tx);
      if (
        !existing ||
        existing.role === 'SUPER_ADMIN' ||
        (auth.role !== 'SUPER_ADMIN' && existing.tenantId !== auth.tenantId)
      ) {
        throw errors.notFound('User');
      }
      assertCanManage(auth, existing.role, existing.agencyId);
      await usersRepository.update(
        id,
        { passwordHash, failedLoginCount: 0, lockedUntil: null },
        tx,
      );
      await usersRepository.revokeAllSessions(id, tx);
      await recordAudit(
        {
          tenantId: existing.tenantId,
          actorType: 'USER',
          actorId: auth.userId,
          action: 'user.password_reset',
          entityType: 'user',
          entityId: id,
          request,
        },
        tx,
      );
    });
  },
};
