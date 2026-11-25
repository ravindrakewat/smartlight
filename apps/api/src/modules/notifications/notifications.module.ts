/**
 * In-app notifications for staff:
 *   GET  /v1/notifications                own notifications, newest first (?unread=true)
 *   GET  /v1/notifications/unread-count   badge number
 *   POST /v1/notifications/read           mark some or all as read
 *   POST /v1/notifications/push-devices   remember this phone's push token
 *
 * Push delivery (FCM / APNs) is not wired: no credentials are configured, so
 * tokens are stored only. In-app notifications work without it.
 */
import type { Prisma } from '@smart-light/db';
import {
  listNotificationsQuerySchema,
  markNotificationsReadSchema,
  notificationSchema,
  paginatedEnvelope,
  registerPushDeviceSchema,
  successEnvelope,
  unreadCountSchema,
  type NotificationDto,
  type NotificationKind,
} from '@smart-light/shared';
import { Router, type Request, type Response } from 'express';
import { sendData, sendPage } from '../../lib/http';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';
import { paginationMeta, toSkipTake } from '../../lib/pagination';
import { prisma, type DbClient } from '../../lib/prisma';
import { authenticate } from '../../middlewares/authenticate';
import { getAuth } from '../auth/auth.context';

type NotificationData = Record<string, string | number | null>;

/**
 * Creates one notification per recipient (duplicates removed). Call it inside the
 * transaction that made the change, so a rolled-back action notifies nobody.
 */
export async function notifyUsers(
  db: DbClient,
  input: {
    userIds: (string | null | undefined)[];
    tenantId: string | null;
    kind: NotificationKind;
    data: NotificationData;
    entityType?: string;
    entityId?: string;
    /** The person who acted is not told about their own action. */
    exceptUserId?: string | null;
  },
): Promise<number> {
  const recipients = [...new Set(input.userIds)].filter(
    (id): id is string => typeof id === 'string' && id !== input.exceptUserId,
  );
  if (recipients.length === 0) return 0;
  const result = await db.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      tenantId: input.tenantId,
      kind: input.kind,
      data: input.data as Prisma.InputJsonValue,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    })),
  });
  return result.count;
}

/** Active supervisors and municipal admins of a city: the people who verify and escalate. */
export async function supervisorIds(db: DbClient, tenantId: string): Promise<string[]> {
  const rows = await db.user.findMany({
    where: { tenantId, status: 'ACTIVE', role: { in: ['SUPERVISOR', 'MUNICIPAL_ADMIN'] } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

function toDto(row: Prisma.NotificationGetPayload<object>): NotificationDto {
  const data =
    row.data && typeof row.data === 'object' && !Array.isArray(row.data)
      ? (row.data as NotificationData)
      : {};
  return {
    id: row.id,
    kind: row.kind,
    data,
    entityType: row.entityType,
    entityId: row.entityId,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get('/', async (req: Request, res: Response) => {
  const auth = getAuth(res);
  const query = listNotificationsQuerySchema.parse(req.query);
  const where = { userId: auth.userId, ...(query.unread ? { readAt: null } : {}) };
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(query) }),
    prisma.notification.count({ where }),
  ]);
  sendPage(res, rows.map(toDto), paginationMeta(query, total));
});

notificationsRouter.get('/unread-count', async (_req: Request, res: Response) => {
  const auth = getAuth(res);
  const unread = await prisma.notification.count({
    where: { userId: auth.userId, readAt: null },
  });
  sendData(res, { unread });
});

notificationsRouter.post('/read', async (req: Request, res: Response) => {
  const auth = getAuth(res);
  const input = markNotificationsReadSchema.parse(req.body);
  await prisma.notification.updateMany({
    where: {
      userId: auth.userId,
      readAt: null,
      ...('ids' in input ? { id: { in: input.ids } } : {}),
    },
    data: { readAt: new Date() },
  });
  const unread = await prisma.notification.count({
    where: { userId: auth.userId, readAt: null },
  });
  sendData(res, { unread });
});

notificationsRouter.post('/push-devices', async (req: Request, res: Response) => {
  const auth = getAuth(res);
  const input = registerPushDeviceSchema.parse(req.body);
  // A token belongs to one phone; if someone else signs in on it, it moves to them.
  await prisma.pushDevice.upsert({
    where: { token: input.token },
    create: { userId: auth.userId, token: input.token, platform: input.platform },
    update: { userId: auth.userId, platform: input.platform, lastSeenAt: new Date() },
  });
  res.status(204).end();
});

const TAG = 'Notifications';
registry.registerPath({
  method: 'get',
  path: '/api/v1/notifications',
  tags: [TAG],
  summary: 'Own notifications, newest first',
  security: AUTHENTICATED,
  request: { query: listNotificationsQuerySchema },
  responses: {
    200: {
      description: 'Notifications',
      content: jsonContent(paginatedEnvelope(notificationSchema)),
    },
    ...errorResponses(401),
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/notifications/unread-count',
  tags: [TAG],
  summary: 'Number of unread notifications',
  security: AUTHENTICATED,
  responses: {
    200: { description: 'Count', content: jsonContent(successEnvelope(unreadCountSchema)) },
    ...errorResponses(401),
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/notifications/read',
  tags: [TAG],
  summary: 'Mark notifications as read (by id, or all)',
  security: AUTHENTICATED,
  request: { body: { content: jsonContent(markNotificationsReadSchema) } },
  responses: {
    200: {
      description: 'Remaining unread',
      content: jsonContent(successEnvelope(unreadCountSchema)),
    },
    ...errorResponses(400, 401),
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/notifications/push-devices',
  tags: [TAG],
  summary: 'Register this phone for push notifications (stored; delivery not configured yet)',
  security: AUTHENTICATED,
  request: { body: { content: jsonContent(registerPushDeviceSchema) } },
  responses: { 204: { description: 'Stored' }, ...errorResponses(400, 401) },
});
