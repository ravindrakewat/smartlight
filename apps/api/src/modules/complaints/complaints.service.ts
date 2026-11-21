import type { ComplaintCategory, Prisma, WorkOrderPriority } from '@smart-light/db';
import {
  distanceInMetres,
  maskPhone,
  parsePoleCode,
  type ComplaintDto,
  type createComplaintSchema,
  type listComplaintsQuerySchema,
  type PaginationMeta,
  type PublicComplaintDto,
  type PublicPoleDto,
} from '@smart-light/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import { nextReference } from '../../lib/counters';
import { paginationMeta, toSkipTake } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { toIso } from '../../lib/roles';
import { errors } from '../../utils/errors';
import { recordAudit } from '../audit/audit.service';
import { requireTenantId, type AuthContext } from '../auth/auth.context';
import type { CitizenContext } from '../citizen-auth/citizen-auth.module';
import { OPEN_STATUSES, workOrdersRepository } from '../work-orders/work-orders.repository';
import { createWorkOrderTx } from '../work-orders/work-orders.service';
import { complaintsRepository, type ComplaintWithRelations } from './complaints.repository';

const MAX_COMPLAINTS_PER_DAY = 10;
const NEAREST_POLE_MAX_M = 60;

const PRIORITY_BY_CATEGORY: Record<ComplaintCategory, WorkOrderPriority> = {
  EXPOSED_WIRING: 'CRITICAL',
  DAMAGED_POLE: 'HIGH',
  LIGHT_OFF: 'NORMAL',
  FLICKERING: 'NORMAL',
  DAY_BURNING: 'NORMAL',
  OTHER: 'NORMAL',
};
const PRIORITY_RANK: Record<WorkOrderPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

/** Citizen-facing timeline derived from the work-order history. */
function timelineOf(complaint: ComplaintWithRelations): PublicComplaintDto['timeline'] {
  const timeline: PublicComplaintDto['timeline'] = [
    { status: 'SUBMITTED', at: complaint.createdAt.toISOString() },
  ];
  const after = (date: Date) => (date < complaint.createdAt ? complaint.createdAt : date);
  const events = complaint.workOrder?.events ?? [];
  const lastOf = (type: string) => [...events].reverse().find((event) => event.type === type);

  const assigned = lastOf('ASSIGNED');
  if (assigned && complaint.status !== 'SUBMITTED') {
    timeline.push({ status: 'ASSIGNED', at: after(assigned.createdAt).toISOString() });
  }
  const started = lastOf('STARTED');
  if (started && complaint.status !== 'SUBMITTED') {
    timeline.push({ status: 'IN_PROGRESS', at: after(started.createdAt).toISOString() });
  }
  if (complaint.status === 'RESOLVED' && complaint.resolvedAt) {
    timeline.push({ status: 'RESOLVED', at: complaint.resolvedAt.toISOString() });
  }
  if (complaint.status === 'REJECTED') {
    timeline.push({ status: 'REJECTED', at: complaint.updatedAt.toISOString() });
  }
  return timeline;
}

export function toPublicComplaint(complaint: ComplaintWithRelations): PublicComplaintDto {
  return {
    number: complaint.number,
    status: complaint.status,
    category: complaint.category,
    poleCode: complaint.pole?.code ?? null,
    tenant: complaint.tenant,
    createdAt: complaint.createdAt.toISOString(),
    resolvedAt: toIso(complaint.resolvedAt),
    slaDueAt: toIso(complaint.workOrder?.slaDueAt ?? null),
    timeline: timelineOf(complaint),
  };
}

function toStaffDto(complaint: ComplaintWithRelations): ComplaintDto {
  return {
    id: complaint.id,
    number: complaint.number,
    status: complaint.status,
    category: complaint.category,
    description: complaint.description,
    source: complaint.source,
    poleCode: complaint.pole?.code ?? null,
    workOrderNumber: complaint.workOrder?.number ?? null,
    latitude: complaint.latitude,
    longitude: complaint.longitude,
    citizenPhoneMasked: complaint.citizen ? maskPhone(complaint.citizen.phone) : null,
    createdAt: complaint.createdAt.toISOString(),
    resolvedAt: toIso(complaint.resolvedAt),
  };
}

async function resolveTenantAndPole(input: z.output<typeof createComplaintSchema>) {
  if (input.poleCode) {
    const parsed = parsePoleCode(input.poleCode);
    if (!parsed) {
      throw errors.badRequest('INVALID_POLE_CODE', 'Pole number is not valid — please check it');
    }
    const pole = await prisma.pole.findUnique({
      where: { code: parsed.code },
      include: { tenant: true },
    });
    if (!pole || pole.assetStatus !== 'ACTIVE' || pole.tenant.status === 'SUSPENDED') {
      throw errors.notFound('Pole');
    }
    return { tenant: pole.tenant, poleId: pole.id as string | null };
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: input.tenantSlug ?? '' } });
  if (!tenant || tenant.status === 'SUSPENDED') {
    throw errors.notFound('Municipality');
  }
  const here = { latitude: input.latitude ?? 0, longitude: input.longitude ?? 0 };
  const nearest = (
    await complaintsRepository.findPolesNear(tenant.id, here.latitude, here.longitude)
  )
    .map((pole) => ({ id: pole.id, distance: distanceInMetres(here, pole) }))
    .filter((pole) => pole.distance <= NEAREST_POLE_MAX_M)
    .sort((a, b) => a.distance - b.distance)[0];
  return { tenant, poleId: nearest?.id ?? null };
}

export const complaintsService = {
  /**
   * Files a citizen complaint. If the pole already has an open repair, the
   * complaint joins it instead of creating a duplicate work order.
   */
  async create(
    citizen: CitizenContext,
    input: z.output<typeof createComplaintSchema>,
    request: Request,
  ): Promise<{ complaint: PublicComplaintDto; joinedExistingRepair: boolean }> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (
      (await complaintsRepository.countRecentByCitizen(citizen.citizenId, since)) >=
      MAX_COMPLAINTS_PER_DAY
    ) {
      throw errors.tooManyRequests('Daily complaint limit reached. Please try again tomorrow.');
    }
    const { tenant, poleId } = await resolveTenantAndPole(input);

    const result = await prisma.$transaction(async (tx) => {
      if (poleId) {
        const duplicate = await complaintsRepository.findOpenByCitizenAndPole(
          citizen.citizenId,
          poleId,
          tx,
        );
        if (duplicate) {
          return { complaintId: duplicate.id, joined: true };
        }
      }
      if (input.name) {
        await tx.citizen.update({ where: { id: citizen.citizenId }, data: { name: input.name } });
      }

      let workOrderId: string | null = null;
      let joined = false;
      if (poleId) {
        const priority = PRIORITY_BY_CATEGORY[input.category];
        const open = await workOrdersRepository.findOpenForPole(poleId, tx);
        if (open) {
          joined = true;
          workOrderId = open.id;
          if (PRIORITY_RANK[priority] < PRIORITY_RANK[open.priority]) {
            await workOrdersRepository.update(open.id, { priority }, tx);
          }
        } else {
          const workOrder = await createWorkOrderTx(tx, {
            tenant,
            poleId,
            source: 'CITIZEN_COMPLAINT',
            priority,
            faultType: input.category,
            description: input.description ?? null,
          });
          workOrderId = workOrder.id;
        }
      }

      const open = workOrderId
        ? await tx.workOrder.findUnique({
            where: { id: workOrderId },
            select: { status: true, number: true },
          })
        : null;
      const complaint = await complaintsRepository.create(
        {
          tenantId: tenant.id,
          number: await nextReference(tx, tenant, 'complaint'),
          poleId,
          citizenId: citizen.citizenId,
          workOrderId,
          category: input.category,
          description: input.description ?? null,
          source: 'WEB',
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          status: open && open.status !== 'OPEN' ? 'IN_PROGRESS' : 'SUBMITTED',
        },
        tx,
      );
      if (workOrderId) {
        await workOrdersRepository.addEvent(tx, {
          workOrderId,
          type: 'COMMENT',
          note: `Citizen complaint ${complaint.number}${joined ? ' (joined existing repair)' : ''}`,
        });
      }
      await recordAudit(
        {
          tenantId: tenant.id,
          actorType: 'CITIZEN',
          actorId: citizen.citizenId,
          action: 'complaint.create',
          entityType: 'complaint',
          entityId: complaint.id,
          metadata: { number: complaint.number, workOrder: open?.number ?? null, joined },
          request,
        },
        tx,
      );
      return { complaintId: complaint.id, joined };
    });

    const complaint = await complaintsRepository.findById(result.complaintId, prisma);
    return {
      complaint: toPublicComplaint(complaint as ComplaintWithRelations),
      joinedExistingRepair: result.joined,
    };
  },

  async getPublic(number: string): Promise<PublicComplaintDto> {
    const complaint = await complaintsRepository.findByNumber(number.trim().toUpperCase());
    if (!complaint) {
      throw errors.notFound('Complaint');
    }
    return toPublicComplaint(complaint);
  },

  async listMine(citizen: CitizenContext): Promise<PublicComplaintDto[]> {
    return (await complaintsRepository.listForCitizen(citizen.citizenId)).map(toPublicComplaint);
  },

  async listForStaff(
    auth: AuthContext,
    query: z.output<typeof listComplaintsQuerySchema>,
  ): Promise<{ items: ComplaintDto[]; pagination: PaginationMeta }> {
    const where: Prisma.ComplaintWhereInput = {
      tenantId: requireTenantId(auth, query.tenantId),
      ...(query.status ? { status: query.status } : {}),
    };
    const { items, total } = await complaintsRepository.listForTenant(where, toSkipTake(query));
    return { items: items.map(toStaffDto), pagination: paginationMeta(query, total) };
  },

  /** What a citizen sees after scanning a pole's QR plate. */
  async getPublicPole(rawCode: string): Promise<PublicPoleDto> {
    const parsed = parsePoleCode(rawCode);
    if (!parsed) {
      throw errors.badRequest('INVALID_POLE_CODE', 'Pole number is not valid — please check it');
    }
    const pole = await prisma.pole.findUnique({
      where: { code: parsed.code },
      include: {
        tenant: { select: { slug: true, name: true, nameHi: true, status: true } },
        zone: { select: { name: true } },
        workOrders: {
          where: { status: { in: OPEN_STATUSES } },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { status: true, slaDueAt: true, createdAt: true },
        },
      },
    });
    if (!pole || pole.tenant.status === 'SUSPENDED' || pole.assetStatus !== 'ACTIVE') {
      throw errors.notFound('Pole');
    }
    const repair = pole.workOrders[0];
    return {
      code: pole.code,
      tenant: { slug: pole.tenant.slug, name: pole.tenant.name, nameHi: pole.tenant.nameHi },
      zoneName: pole.zone?.name ?? null,
      address: pole.address,
      latitude: pole.latitude,
      longitude: pole.longitude,
      lightStatus: pole.lightStatus,
      lightStatusAt: toIso(pole.lightStatusAt),
      openRepair: repair
        ? {
            status: repair.status,
            slaDueAt: repair.slaDueAt.toISOString(),
            reportedAt: repair.createdAt.toISOString(),
          }
        : null,
    };
  },
};
