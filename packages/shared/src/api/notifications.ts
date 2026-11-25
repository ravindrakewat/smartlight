import { z } from 'zod';
import { paginationQuerySchema } from '../schemas/pagination';

/** What happened. Clients turn kind + data into text in the reader's language. */
export const NOTIFICATION_KINDS = [
  'work_order.assigned',
  'work_order.fix_rejected',
  'work_order.verified',
  'work_order.awaiting_verification',
  'work_order.sla_breached',
] as const;
export const notificationKindSchema = z.enum(NOTIFICATION_KINDS);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationSchema = z
  .object({
    id: z.uuid(),
    kind: z.string(),
    /** e.g. { number: 'IND-W-000042', poleCode: 'IND-000001-8' } */
    data: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
    entityType: z.string().nullable(),
    entityId: z.string().nullable(),
    read: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Notification' });
export type NotificationDto = z.infer<typeof notificationSchema>;

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unread: z.stringbool().optional(),
});

export const markNotificationsReadSchema = z
  .union([
    z.object({ ids: z.array(z.uuid()).min(1).max(100) }),
    z.object({ all: z.literal(true) }),
  ])
  .meta({ id: 'MarkNotificationsReadRequest' });

export const unreadCountSchema = z.object({ unread: z.number().int() }).meta({ id: 'UnreadCount' });

export const registerPushDeviceSchema = z
  .object({
    token: z.string().trim().min(10).max(4096),
    platform: z.enum(['android', 'ios', 'web']),
  })
  .meta({ id: 'RegisterPushDeviceRequest' });
