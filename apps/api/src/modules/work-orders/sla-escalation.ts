/**
 * SLA escalation: finds open work orders past their deadline and, once per job,
 * records an SLA_BREACHED event and notifies the technician and the city's
 * supervisors. Safe to run on several API instances: the event is written in a
 * transaction that first re-checks that no breach was recorded.
 */
import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { notifyUsers, supervisorIds } from '../notifications/notifications.module';

const OPEN = ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] as const;
const BATCH = 200;

export async function escalateOverdueWorkOrders(now = new Date()): Promise<number> {
  const overdue = await prisma.workOrder.findMany({
    where: {
      status: { in: [...OPEN] },
      slaDueAt: { lt: now },
      events: { none: { type: 'SLA_BREACHED' } },
    },
    select: {
      id: true,
      tenantId: true,
      number: true,
      priority: true,
      slaDueAt: true,
      assignedTechnicianId: true,
      pole: { select: { code: true } },
    },
    orderBy: { slaDueAt: 'asc' },
    take: BATCH,
  });

  let escalated = 0;
  for (const job of overdue) {
    const done = await prisma.$transaction(async (tx) => {
      const already = await tx.workOrderEvent.count({
        where: { workOrderId: job.id, type: 'SLA_BREACHED' },
      });
      if (already > 0) return false;
      await tx.workOrderEvent.create({
        data: {
          workOrderId: job.id,
          type: 'SLA_BREACHED',
          metadata: { slaDueAt: job.slaDueAt.toISOString() },
        },
      });
      await notifyUsers(tx, {
        userIds: [job.assignedTechnicianId, ...(await supervisorIds(tx, job.tenantId))],
        tenantId: job.tenantId,
        kind: 'work_order.sla_breached',
        data: { number: job.number, poleCode: job.pole.code, priority: job.priority },
        entityType: 'work_order',
        entityId: job.id,
      });
      return true;
    });
    if (done) escalated++;
  }
  return escalated;
}

/** Runs the sweep every `intervalSeconds` (0 = off). Errors are logged, never thrown. */
export function startSlaEscalation(intervalSeconds: number): NodeJS.Timeout | null {
  if (intervalSeconds <= 0) return null;
  const run = () =>
    void escalateOverdueWorkOrders()
      .then((count) => {
        if (count > 0) logger.info('SLA escalation', { escalated: count });
      })
      .catch((error: unknown) => {
        // Prisma messages start with the call site; the reason is on the last line.
        const message = error instanceof Error ? error.message : String(error);
        const reason = message.split('
').filter((line) => line.trim()).at(-1) ?? message;
        logger.error('SLA escalation failed; will retry on the next run', {
          reason: reason.trim(),
          code: (error as { code?: string } | null)?.code,
        });
      });
  const timer = setInterval(run, intervalSeconds * 1000);
  timer.unref();
  setTimeout(run, 10_000).unref();
  return timer;
}
