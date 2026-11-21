import type { Tenant } from '@smart-light/db';
import type { createTenantSchema, TenantDto, updateTenantSchema } from '@smart-light/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { errors } from '../../utils/errors';
import { recordAudit } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.context';
import { EMPTY_TENANT_STATS, tenantsRepository, type TenantStats } from './tenants.repository';

function toDto(tenant: Tenant, stats: TenantStats): TenantDto {
  return {
    id: tenant.id,
    slug: tenant.slug,
    code: tenant.code,
    name: tenant.name,
    nameHi: tenant.nameHi,
    status: tenant.status,
    timezone: tenant.timezone,
    slaHours: tenant.slaHours,
    createdAt: tenant.createdAt.toISOString(),
    stats,
  };
}

export const tenantsService = {
  async list(): Promise<TenantDto[]> {
    const [tenants, stats] = await Promise.all([
      tenantsRepository.findAll(),
      tenantsRepository.statsByTenant(),
    ]);
    return tenants.map((tenant) => toDto(tenant, stats.get(tenant.id) ?? EMPTY_TENANT_STATS));
  },

  async create(
    input: z.output<typeof createTenantSchema>,
    auth: AuthContext,
    request: Request,
  ): Promise<TenantDto> {
    const tenant = await prisma.$transaction(async (tx) => {
      const created = await tenantsRepository.create(input, tx);
      await recordAudit(
        {
          tenantId: created.id,
          actorType: 'USER',
          actorId: auth.userId,
          action: 'tenant.create',
          entityType: 'tenant',
          entityId: created.id,
          metadata: { slug: created.slug, code: created.code },
          request,
        },
        tx,
      );
      return created;
    });
    return toDto(tenant, EMPTY_TENANT_STATS);
  },

  async update(
    id: string,
    input: z.output<typeof updateTenantSchema>,
    auth: AuthContext,
    request: Request,
  ): Promise<TenantDto> {
    const tenant = await prisma.$transaction(async (tx) => {
      const updated = await tenantsRepository.update(id, input, tx);
      await recordAudit(
        {
          tenantId: id,
          actorType: 'USER',
          actorId: auth.userId,
          action: input.status === 'SUSPENDED' ? 'tenant.suspend' : 'tenant.update',
          entityType: 'tenant',
          entityId: id,
          metadata: input,
          request,
        },
        tx,
      );
      return updated;
    });
    const stats = await tenantsRepository.statsByTenant();
    return toDto(tenant, stats.get(id) ?? EMPTY_TENANT_STATS);
  },

  /** Citizen-portal branding. Suspended municipalities are hidden. */
  async getPublic(slug: string) {
    const tenant = await tenantsRepository.findBySlug(slug);
    if (!tenant || tenant.status === 'SUSPENDED') {
      throw errors.notFound('Municipality');
    }
    return { slug: tenant.slug, code: tenant.code, name: tenant.name, nameHi: tenant.nameHi };
  },
};
