import type { AgencyDto, createAgencySchema, updateAgencySchema } from '@smart-light/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { errors } from '../../utils/errors';
import { recordAudit } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.context';
import { agenciesRepository, type AgencyWithCount } from './agencies.repository';

function toDto(agency: AgencyWithCount): AgencyDto {
  return {
    id: agency.id,
    name: agency.name,
    type: agency.type,
    contactPhone: agency.contactPhone,
    active: agency.active,
    technicianCount: agency._count.users,
  };
}

export const agenciesService = {
  /** Agency managers only ever see their own agency. */
  async list(tenantId: string, auth: AuthContext): Promise<AgencyDto[]> {
    const onlyOwn = auth.role === 'AGENCY_MANAGER' ? (auth.agencyId ?? '') : undefined;
    return (await agenciesRepository.list(tenantId, onlyOwn)).map(toDto);
  },

  async create(
    tenantId: string,
    input: z.output<typeof createAgencySchema>,
    auth: AuthContext,
    request: Request,
  ): Promise<AgencyDto> {
    return prisma.$transaction(async (tx) => {
      const agency = await agenciesRepository.create({ ...input, tenantId }, tx);
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: auth.userId,
          action: 'agency.create',
          entityType: 'agency',
          entityId: agency.id,
          metadata: { name: agency.name, type: agency.type },
          request,
        },
        tx,
      );
      return toDto(agency);
    });
  },

  async update(
    tenantId: string,
    id: string,
    input: z.output<typeof updateAgencySchema>,
    auth: AuthContext,
    request: Request,
  ): Promise<AgencyDto> {
    return prisma.$transaction(async (tx) => {
      if (!(await agenciesRepository.findInTenant(id, tenantId, tx))) {
        throw errors.notFound('Agency');
      }
      const agency = await agenciesRepository.update(id, input, tx);
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: auth.userId,
          action: 'agency.update',
          entityType: 'agency',
          entityId: id,
          metadata: input,
          request,
        },
        tx,
      );
      return toDto(agency);
    });
  },
};
