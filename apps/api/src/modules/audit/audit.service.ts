import type { ActorType, Prisma } from '@smart-light/db';
import type { Request } from 'express';
import { clientInfo } from '../../lib/http';
import { prisma, type DbClient } from '../../lib/prisma';
import { logger } from '../../utils/logger';

export interface AuditEntry {
  tenantId?: string | null;
  actorType: ActorType;
  actorId?: string | null;
  /** Dotted verb, e.g. `auth.login`, `work_order.assign`. */
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  request?: Request;
}

/**
 * Writes an append-only audit record. Pass `db` to write inside a transaction
 * (so the audit entry commits or rolls back with the change it describes).
 */
export async function recordAudit(entry: AuditEntry, db: DbClient = prisma): Promise<void> {
  const client = entry.request ? clientInfo(entry.request) : { ip: null, userAgent: null };
  await db.auditLog.create({
    data: {
      tenantId: entry.tenantId ?? null,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata,
      ip: client.ip,
      userAgent: client.userAgent,
    },
  });
}

/** Audit write that must never break the main flow (e.g. failed-login records). */
export async function recordAuditSafely(entry: AuditEntry): Promise<void> {
  try {
    await recordAudit(entry);
  } catch (error) {
    logger.error('Failed to write audit log', {
      action: entry.action,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
