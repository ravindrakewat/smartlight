import type { Prisma, WorkOrderPriority, WorkOrderSource } from '@smart-light/db';
import {
  distanceInMetres,
  ON_SITE_RADIUS_M,
  type assignWorkOrderSchema,
  type completeWorkOrderSchema,
  type listWorkOrdersQuerySchema,
  type PaginationMeta,
  type startWorkOrderSchema,
  type WorkOrderDetailDto,
  type WorkOrderSummaryDto,
} from '@smart-light/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import { nextReference } from '../../lib/counters';
import { paginationMeta, toSkipTake } from '../../lib/pagination';
import { prisma, type DbClient } from '../../lib/prisma';
import { toIso } from '../../lib/roles';
import { sendSmsInBackground } from '../../lib/sms';
import { AppError } from '../../utils/app-error';
import { errors } from '../../utils/errors';
import { recordAudit } from '../audit/audit.service';
import { requireTenantId, type AuthContext } from '../auth/auth.context';
import { findPoleByCodeInTenant } from '../poles/poles.service';
import {
  OPEN_STATUSES,
  workOrdersRepository,
  type WorkOrderWithEvents,
  type WorkOrderWithRelations,
} from './work-orders.repository';

// ─── Mapping ──────────────────────────────────────────────────────────────────

function isOverdue(workOrder: { status: string; slaDueAt: Date }): boolean {
  return (
    (OPEN_STATUSES as string[]).includes(workOrder.status) &&
    workOrder.slaDueAt.getTime() < Date.now()
  );
}

export function toSummaryDto(workOrder: WorkOrderWithRelations): WorkOrderSummaryDto {
  return {
    id: workOrder.id,
    number: workOrder.number,
    status: workOrder.status,
    priority: workOrder.priority,
    source: workOrder.source,
    faultType: workOrder.faultType,
    pole: {
      id: workOrder.pole.id,
      code: workOrder.pole.code,
      latitude: workOrder.pole.latitude,
      longitude: workOrder.pole.longitude,
      address: workOrder.pole.address,
      zoneName: workOrder.pole.zone?.name ?? null,
      lightStatus: workOrder.pole.lightStatus,
      hasController: workOrder.pole.device !== null,
    },
    agency: workOrder.agency,
    technician: workOrder.technician,
    complaintCount: workOrder._count.complaints,
    slaDueAt: workOrder.slaDueAt.toISOString(),
    overdue: isOverdue(workOrder),
    createdAt: workOrder.createdAt.toISOString(),
    completedAt: toIso(workOrder.completedAt),
    resolvedAt: toIso(workOrder.verifiedAt),
  };
}

function toDetailDto(workOrder: WorkOrderWithEvents): WorkOrderDetailDto {
  return {
    ...toSummaryDto(workOrder),
    description: workOrder.description,
    resolutionCode: (workOrder.resolutionCode as WorkOrderDetailDto['resolutionCode']) ?? null,
    resolutionNotes: workOrder.resolutionNotes,
    verificationMethod: workOrder.verificationMethod,
    startedAt: toIso(workOrder.startedAt),
    checklist: workOrder.checklist,
    parts: workOrder.parts.map((part) => ({
      id: part.id,
      sparePartId: part.sparePartId,
      code: part.sparePart.code,
      name: part.sparePart.name,
      unit: part.sparePart.unit,
      quantity: part.quantity,
    })),
    events: workOrder.events.map((event) => ({
      id: event.id,
      type: event.type,
      actorName: event.actor?.name ?? null,
      note: event.note,
      latitude: event.latitude,
      longitude: event.longitude,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

// ─── Visibility ───────────────────────────────────────────────────────────────

/** Technicians see their own jobs; agency managers see their agency's jobs. */
function visibilityFilter(auth: AuthContext): Prisma.WorkOrderWhereInput {
  if (auth.role === 'TECHNICIAN') {
    return { assignedTechnicianId: auth.userId };
  }
  if (auth.role === 'AGENCY_MANAGER') {
    return { assignedAgencyId: auth.agencyId ?? '' };
  }
  return {};
}

async function loadForAction(
  db: DbClient,
  auth: AuthContext,
  id: string,
  tenantId: string,
): Promise<WorkOrderWithEvents> {
  const workOrder = await workOrdersRepository.findDetail(
    { id, tenantId, ...visibilityFilter(auth) },
    db,
  );
  if (!workOrder) {
    throw errors.notFound('Work order');
  }
  return workOrder;
}

function assertStatus(workOrder: { status: string }, allowed: string[], action: string): void {
  if (!allowed.includes(workOrder.status)) {
    throw errors.conflict(
      'INVALID_STATUS',
      `Cannot ${action} a work order that is ${workOrder.status.toLowerCase()}`,
    );
  }
}

function assertOnSite(
  pole: { latitude: number; longitude: number },
  location: { latitude: number; longitude: number; accuracyM: number },
): number {
  const distance = distanceInMetres(pole, location);
  const allowed = ON_SITE_RADIUS_M + Math.min(location.accuracyM, 100);
  if (distance > allowed) {
    throw new AppError({
      statusCode: 400,
      code: 'TOO_FAR_FROM_POLE',
      message: `You are ${Math.round(distance)} m from the pole. Move within ${ON_SITE_RADIUS_M} m to continue.`,
    });
  }
  return Math.round(distance);
}

/**
 * Parts used on a repair: one usage row and one stock movement per part, stock
 * reduced in the same transaction. Stock may go below zero (field use recorded
 * before the store was restocked); the inventory page shows that as low stock.
 */
async function recordPartsUsed(
  tx: Prisma.TransactionClient,
  auth: AuthContext,
  tenantId: string,
  workOrder: { id: string; number: string },
  parts: { sparePartId: string; quantity: number }[],
): Promise<void> {
  if (parts.length === 0) return;
  const known = await tx.sparePart.findMany({
    where: { tenantId, active: true, id: { in: parts.map((part) => part.sparePartId) } },
    select: { id: true },
  });
  if (known.length !== parts.length) {
    throw new AppError({
      statusCode: 400,
      code: 'UNKNOWN_SPARE_PART',
      message: 'One of the spare parts is not stocked by this municipality',
    });
  }
  for (const part of parts) {
    await tx.workOrderPart.create({
      data: {
        workOrderId: workOrder.id,
        sparePartId: part.sparePartId,
        quantity: part.quantity,
        recordedById: auth.userId,
      },
    });
    await tx.stockMovement.create({
      data: {
        sparePartId: part.sparePartId,
        kind: 'USED',
        quantity: -part.quantity,
        workOrderId: workOrder.id,
        note: workOrder.number,
        actorUserId: auth.userId,
      },
    });
    await tx.sparePart.update({
      where: { id: part.sparePartId },
      data: { stockQty: { decrement: part.quantity } },
    });
  }
}

async function reload(db: DbClient, id: string): Promise<WorkOrderDetailDto> {
  const workOrder = await workOrdersRepository.findDetail({ id }, db);
  return toDetailDto(workOrder as WorkOrderWithEvents);
}

// ─── Creation (shared with complaints and IoT alerts) ─────────────────────────

export interface NewWorkOrder {
  tenant: { id: string; code: string; slaHours: number };
  poleId: string;
  source: WorkOrderSource;
  priority: WorkOrderPriority;
  faultType?: string | null;
  description?: string | null;
  createdById?: string | null;
  note?: string;
}

/** Creates a work order with its SLA deadline and CREATED event (inside a transaction). */
export async function createWorkOrderTx(db: DbClient, input: NewWorkOrder) {
  const number = await nextReference(db, input.tenant, 'work_order');
  const workOrder = await workOrdersRepository.create(
    {
      tenantId: input.tenant.id,
      number,
      poleId: input.poleId,
      source: input.source,
      priority: input.priority,
      faultType: input.faultType ?? null,
      description: input.description ?? null,
      createdById: input.createdById ?? null,
      slaDueAt: new Date(Date.now() + input.tenant.slaHours * 60 * 60 * 1000),
    },
    db,
  );
  await workOrdersRepository.addEvent(db, {
    workOrderId: workOrder.id,
    type: 'CREATED',
    actorUserId: input.createdById ?? null,
    note: input.note ?? null,
  });
  return workOrder;
}

// ─── Resolution ───────────────────────────────────────────────────────────────

async function resolveTx(
  db: DbClient,
  workOrderId: string,
  method: 'IOT_TELEMETRY' | 'SUPERVISOR',
  actorUserId: string | null,
  note: string | null,
): Promise<{ phone: string; number: string }[]> {
  const now = new Date();
  await workOrdersRepository.update(
    workOrderId,
    { status: 'RESOLVED', verifiedAt: now, verificationMethod: method },
    db,
  );
  await workOrdersRepository.addEvent(db, {
    workOrderId,
    type: 'VERIFIED',
    actorUserId,
    note,
    metadata: { method },
  });
  const complaints = await db.complaint.findMany({
    where: { workOrderId, status: { in: ['SUBMITTED', 'IN_PROGRESS'] } },
    include: { citizen: { select: { phone: true } } },
  });
  await db.complaint.updateMany({
    where: { id: { in: complaints.map((complaint) => complaint.id) } },
    data: { status: 'RESOLVED', resolvedAt: now },
  });
  return complaints
    .filter((complaint) => complaint.citizen)
    .map((complaint) => ({ phone: complaint.citizen?.phone ?? '', number: complaint.number }));
}

function notifyCitizens(recipients: { phone: string; number: string }[]): void {
  for (const recipient of recipients) {
    sendSmsInBackground(recipient.phone, {
      template: 'complaint_resolved',
      complaintNumber: recipient.number,
    });
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const workOrdersService = {
  async list(
    auth: AuthContext,
    query: z.output<typeof listWorkOrdersQuerySchema>,
  ): Promise<{ items: WorkOrderSummaryDto[]; pagination: PaginationMeta }> {
    const tenantId = requireTenantId(auth, query.tenantId);
    const where: Prisma.WorkOrderWhereInput = {
      tenantId,
      ...visibilityFilter(auth),
      ...(query.status ? { status: query.status } : {}),
      ...(query.open ? { status: { in: OPEN_STATUSES } } : {}),
      ...(query.overdue ? { status: { in: OPEN_STATUSES }, slaDueAt: { lt: new Date() } } : {}),
      ...(query.agencyId ? { assignedAgencyId: query.agencyId } : {}),
      ...(query.technicianId ? { assignedTechnicianId: query.technicianId } : {}),
    };
    const { items, total } = await workOrdersRepository.list(where, toSkipTake(query));
    return { items: items.map(toSummaryDto), pagination: paginationMeta(query, total) };
  },

  async get(
    auth: AuthContext,
    id: string,
    requestedTenantId?: string,
  ): Promise<WorkOrderDetailDto> {
    const tenantId = requireTenantId(auth, requestedTenantId);
    return toDetailDto(await loadForAction(prisma, auth, id, tenantId));
  },

  async create(
    auth: AuthContext,
    input: {
      poleCode: string;
      faultType?: string;
      description?: string;
      priority: WorkOrderPriority;
    },
    request: Request,
    requestedTenantId?: string,
  ): Promise<WorkOrderDetailDto> {
    const tenantId = requireTenantId(auth, requestedTenantId);
    return prisma.$transaction(async (tx) => {
      const pole = await findPoleByCodeInTenant(input.poleCode, tenantId, tx);
      const existing = await workOrdersRepository.findOpenForPole(pole.id, tx);
      if (existing) {
        throw errors.conflict(
          'WORK_ORDER_EXISTS',
          `Work order ${existing.number} is already open for this pole`,
        );
      }
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const workOrder = await createWorkOrderTx(tx, {
        tenant,
        poleId: pole.id,
        source: 'MANUAL',
        priority: input.priority,
        faultType: input.faultType ?? null,
        description: input.description ?? null,
        createdById: auth.userId,
      });
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: auth.userId,
          action: 'work_order.create',
          entityType: 'work_order',
          entityId: workOrder.id,
          metadata: { number: workOrder.number, poleCode: pole.code },
          request,
        },
        tx,
      );
      return reload(tx, workOrder.id);
    });
  },

  async assign(
    auth: AuthContext,
    id: string,
    input: z.output<typeof assignWorkOrderSchema>,
    request: Request,
    requestedTenantId?: string,
  ): Promise<WorkOrderDetailDto> {
    const tenantId = requireTenantId(auth, requestedTenantId);
    return prisma.$transaction(async (tx) => {
      const workOrder = await loadForAction(tx, auth, id, tenantId);
      assertStatus(workOrder, ['OPEN', 'ASSIGNED', 'IN_PROGRESS'], 'assign');

      let agencyId = input.agencyId ?? null;
      let technicianId: string | null = null;
      let technicianName: string | null = null;
      if (input.technicianId) {
        const technician = await tx.user.findFirst({
          where: { id: input.technicianId, tenantId, role: 'TECHNICIAN', status: 'ACTIVE' },
        });
        if (!technician) {
          throw errors.badRequest('INVALID_TECHNICIAN', 'Technician not found or inactive');
        }
        if (agencyId && technician.agencyId !== agencyId) {
          throw errors.badRequest('AGENCY_MISMATCH', 'Technician does not belong to that agency');
        }
        agencyId = technician.agencyId;
        technicianId = technician.id;
        technicianName = technician.name;
      }
      if (agencyId) {
        const agency = await tx.agency.findFirst({
          where: { id: agencyId, tenantId, active: true },
        });
        if (!agency) {
          throw errors.badRequest('INVALID_AGENCY', 'Agency not found or inactive');
        }
      }
      // Agency managers can only dispatch within their own agency.
      if (auth.role === 'AGENCY_MANAGER' && agencyId !== auth.agencyId) {
        throw errors.forbidden('You can only assign technicians of your own agency');
      }

      await workOrdersRepository.update(
        id,
        {
          assignedAgencyId: agencyId,
          assignedTechnicianId: technicianId,
          status: technicianId ? 'ASSIGNED' : 'OPEN',
          startedAt: null,
        },
        tx,
      );
      await workOrdersRepository.addEvent(tx, {
        workOrderId: id,
        type: 'ASSIGNED',
        actorUserId: auth.userId,
        // Free text only from people; the UI renders the event in the viewer's language.
        note: input.note ?? null,
        metadata: { agencyId, technicianId, technicianName },
      });
      if (technicianId) {
        await tx.complaint.updateMany({
          where: { workOrderId: id, status: 'SUBMITTED' },
          data: { status: 'IN_PROGRESS' },
        });
      }
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: auth.userId,
          action: 'work_order.assign',
          entityType: 'work_order',
          entityId: id,
          metadata: { agencyId, technicianId },
          request,
        },
        tx,
      );
      return reload(tx, id);
    });
  },

  async start(
    auth: AuthContext,
    id: string,
    location: z.output<typeof startWorkOrderSchema>,
  ): Promise<WorkOrderDetailDto> {
    const tenantId = requireTenantId(auth);
    return prisma.$transaction(async (tx) => {
      const workOrder = await loadForAction(tx, auth, id, tenantId);
      if (workOrder.assignedTechnicianId !== auth.userId) {
        throw errors.forbidden('Only the assigned technician can start this job');
      }
      assertStatus(workOrder, ['ASSIGNED'], 'start');
      const distanceM = assertOnSite(workOrder.pole, location);

      await workOrdersRepository.update(id, { status: 'IN_PROGRESS', startedAt: new Date() }, tx);
      await workOrdersRepository.addEvent(tx, {
        workOrderId: id,
        type: 'STARTED',
        actorUserId: auth.userId,
        latitude: location.latitude,
        longitude: location.longitude,
        metadata: { distanceM, accuracyM: location.accuracyM },
      });
      return reload(tx, id);
    });
  },

  async complete(
    auth: AuthContext,
    id: string,
    input: z.output<typeof completeWorkOrderSchema>,
  ): Promise<WorkOrderDetailDto> {
    const tenantId = requireTenantId(auth);
    return prisma.$transaction(async (tx) => {
      const workOrder = await loadForAction(tx, auth, id, tenantId);
      if (workOrder.assignedTechnicianId !== auth.userId) {
        throw errors.forbidden('Only the assigned technician can complete this job');
      }
      assertStatus(workOrder, ['IN_PROGRESS'], 'complete');
      const distanceM = assertOnSite(workOrder.pole, input);
      await recordPartsUsed(tx, auth, tenantId, workOrder, input.parts);

      await workOrdersRepository.update(
        id,
        {
          status: 'PENDING_VERIFICATION',
          completedAt: new Date(),
          resolutionCode: input.resolutionCode,
          resolutionNotes: input.notes ?? null,
          checklist: input.checklist,
        },
        tx,
      );
      await workOrdersRepository.addEvent(tx, {
        workOrderId: id,
        type: 'COMPLETED',
        actorUserId: auth.userId,
        note: input.notes ?? null,
        latitude: input.latitude,
        longitude: input.longitude,
        metadata: {
          resolutionCode: input.resolutionCode,
          distanceM,
          checklist: input.checklist,
          parts: input.parts,
        },
      });
      return reload(tx, id);
    });
  },

  /** Supervisor decision for poles without a controller (or a disputed IoT result). */
  async verify(
    auth: AuthContext,
    id: string,
    input: { approved: boolean; note?: string },
    request: Request,
    requestedTenantId?: string,
  ): Promise<WorkOrderDetailDto> {
    const tenantId = requireTenantId(auth, requestedTenantId);
    let recipients: { phone: string; number: string }[] = [];
    const result = await prisma.$transaction(async (tx) => {
      const workOrder = await loadForAction(tx, auth, id, tenantId);
      assertStatus(workOrder, ['PENDING_VERIFICATION'], 'verify');

      if (input.approved) {
        recipients = await resolveTx(tx, id, 'SUPERVISOR', auth.userId, input.note ?? null);
      } else {
        await workOrdersRepository.update(
          id,
          { status: 'ASSIGNED', completedAt: null, startedAt: null },
          tx,
        );
        await workOrdersRepository.addEvent(tx, {
          workOrderId: id,
          type: 'VERIFICATION_FAILED',
          actorUserId: auth.userId,
          note: input.note ?? 'Fix not accepted by supervisor',
        });
      }
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: auth.userId,
          action: input.approved ? 'work_order.verify' : 'work_order.reject_fix',
          entityType: 'work_order',
          entityId: id,
          request,
        },
        tx,
      );
      return reload(tx, id);
    });
    notifyCitizens(recipients);
    return result;
  },

  /**
   * Called by the IoT ingestion worker when a controller reports the lamp state
   * after a repair. A working lamp closes the job automatically; a dead lamp
   * sends it back to the technician. Fake closures are therefore impossible.
   */
  async verifyFromTelemetry(poleId: string, lampWorking: boolean): Promise<string | null> {
    let recipients: { phone: string; number: string }[] = [];
    const outcome = await prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.findFirst({
        where: { poleId, status: 'PENDING_VERIFICATION' },
      });
      if (!workOrder) {
        return null;
      }
      if (lampWorking) {
        recipients = await resolveTx(
          tx,
          workOrder.id,
          'IOT_TELEMETRY',
          null,
          'Lamp current confirmed by controller',
        );
        await tx.pole.update({
          where: { id: poleId },
          data: { lightStatus: 'ON', lightStatusAt: new Date() },
        });
      } else {
        await workOrdersRepository.update(
          workOrder.id,
          { status: 'ASSIGNED', completedAt: null, startedAt: null },
          tx,
        );
        await workOrdersRepository.addEvent(tx, {
          workOrderId: workOrder.id,
          type: 'VERIFICATION_FAILED',
          note: 'Controller still reports no lamp current',
        });
      }
      await recordAudit(
        {
          tenantId: workOrder.tenantId,
          actorType: 'SYSTEM',
          action: lampWorking ? 'work_order.verify_iot' : 'work_order.reject_fix_iot',
          entityType: 'work_order',
          entityId: workOrder.id,
        },
        tx,
      );
      return workOrder.id;
    });
    notifyCitizens(recipients);
    return outcome;
  },

  async cancel(
    auth: AuthContext,
    id: string,
    reason: string,
    request: Request,
    requestedTenantId?: string,
  ): Promise<WorkOrderDetailDto> {
    const tenantId = requireTenantId(auth, requestedTenantId);
    return prisma.$transaction(async (tx) => {
      const workOrder = await loadForAction(tx, auth, id, tenantId);
      assertStatus(workOrder, OPEN_STATUSES, 'cancel');
      await workOrdersRepository.update(id, { status: 'CANCELLED' }, tx);
      await workOrdersRepository.addEvent(tx, {
        workOrderId: id,
        type: 'CANCELLED',
        actorUserId: auth.userId,
        note: reason,
      });
      await tx.complaint.updateMany({
        where: { workOrderId: id, status: { in: ['SUBMITTED', 'IN_PROGRESS'] } },
        data: { status: 'REJECTED' },
      });
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: auth.userId,
          action: 'work_order.cancel',
          entityType: 'work_order',
          entityId: id,
          metadata: { reason },
          request,
        },
        tx,
      );
      return reload(tx, id);
    });
  },
};
