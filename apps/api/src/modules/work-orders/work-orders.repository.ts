import type { Prisma, WorkOrderEventType, WorkOrderStatus } from '@smart-light/db';
import { prisma, type DbClient } from '../../lib/prisma';

/** Statuses in which a work order still needs attention. */
export const OPEN_STATUSES: WorkOrderStatus[] = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'PENDING_VERIFICATION',
];

export const workOrderInclude = {
  pole: {
    select: {
      id: true,
      code: true,
      latitude: true,
      longitude: true,
      address: true,
      lightStatus: true,
      zone: { select: { name: true } },
      device: { select: { id: true, online: true } },
    },
  },
  agency: { select: { id: true, name: true } },
  technician: { select: { id: true, name: true } },
  _count: { select: { complaints: true } },
} satisfies Prisma.WorkOrderInclude;

export const workOrderDetailInclude = {
  ...workOrderInclude,
  events: {
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: { name: true } } },
  },
  parts: {
    orderBy: { createdAt: 'asc' },
    include: { sparePart: { select: { code: true, name: true, unit: true } } },
  },
} satisfies Prisma.WorkOrderInclude;

export type WorkOrderWithRelations = Prisma.WorkOrderGetPayload<{
  include: typeof workOrderInclude;
}>;
export type WorkOrderWithEvents = Prisma.WorkOrderGetPayload<{
  include: typeof workOrderDetailInclude;
}>;

export const workOrdersRepository = {
  async list(
    where: Prisma.WorkOrderWhereInput,
    page: { skip: number; take: number },
  ): Promise<{ items: WorkOrderWithRelations[]; total: number }> {
    const [items, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        include: workOrderInclude,
        orderBy: [{ slaDueAt: 'asc' }, { createdAt: 'asc' }],
        ...page,
      }),
      prisma.workOrder.count({ where }),
    ]);
    return { items, total };
  },

  findDetail(where: Prisma.WorkOrderWhereInput, db: DbClient = prisma) {
    return db.workOrder.findFirst({ where, include: workOrderDetailInclude });
  },

  findOpenForPole(poleId: string, db: DbClient) {
    return db.workOrder.findFirst({
      where: { poleId, status: { in: OPEN_STATUSES } },
      orderBy: { createdAt: 'asc' },
    });
  },

  create(data: Prisma.WorkOrderUncheckedCreateInput, db: DbClient) {
    return db.workOrder.create({ data });
  },

  update(id: string, data: Prisma.WorkOrderUncheckedUpdateInput, db: DbClient) {
    return db.workOrder.update({ where: { id }, data });
  },

  addEvent(
    db: DbClient,
    event: {
      workOrderId: string;
      type: WorkOrderEventType;
      actorUserId?: string | null;
      note?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    return db.workOrderEvent.create({ data: event });
  },
};
