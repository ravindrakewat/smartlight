import { z } from 'zod';
import { paginationQuerySchema } from '../schemas/pagination';

// ─── Audit log ───────────────────────────────────────────────────────────────

export const auditEntrySchema = z
  .object({
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    action: z.string(),
    actorType: z.enum(['USER', 'CITIZEN', 'SYSTEM', 'DEVICE']),
    /** Staff name for USER actors; device id for DEVICE actors. */
    actor: z.string().nullable(),
    entityType: z.string().nullable(),
    entityId: z.string().nullable(),
    ip: z.string().nullable(),
    tenant: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    metadata: z.unknown().nullable(),
  })
  .meta({ id: 'AuditEntry' });

export type AuditEntryDto = z.infer<typeof auditEntrySchema>;

export const listAuditQuerySchema = paginationQuerySchema.extend({
  /** Prefix match, e.g. `auth.` or `work_order.verify`. */
  action: z.string().trim().max(60).optional(),
  tenantId: z.uuid().optional(),
});

// ─── Controllers across the platform ─────────────────────────────────────────

export const deviceListItemSchema = z
  .object({
    id: z.uuid(),
    deviceId: z.string(),
    tenant: z.object({ id: z.uuid(), name: z.string(), code: z.string() }),
    pole: z.object({ id: z.uuid(), code: z.string() }).nullable(),
    online: z.boolean(),
    lastSeenAt: z.iso.datetime().nullable(),
    firmwareVersion: z.string().nullable(),
    mode: z.string().nullable(),
    lampOn: z.boolean().nullable(),
  })
  .meta({ id: 'DeviceListItem' });

export type DeviceListItemDto = z.infer<typeof deviceListItemSchema>;

export const listDevicesQuerySchema = paginationQuerySchema.extend({
  online: z.stringbool().optional(),
  /** Matches the controller id or the pole code. */
  search: z.string().trim().max(60).optional(),
  tenantId: z.uuid().optional(),
});
