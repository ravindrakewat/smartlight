/**
 * Repair photos (private):
 *   POST /v1/work-orders/:id/photos?kind=BEFORE|AFTER   raw image body (JPEG/PNG/WebP, ≤ 5 MB);
 *                                                        assigned technician, while working
 *   GET  /v1/work-orders/:id/photos                      list with 10-minute signed links
 *   GET  /v1/photos/:id?exp=&sig=                        the image, only with a valid signature
 *
 * Anyone who can see the work order can see its photos. Photos are never public.
 */
import { randomUUID } from 'node:crypto';
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_KIND,
  successEnvelope,
  uploadPhotoQuerySchema,
  workOrderPhotoSchema,
  type WorkOrderPhotoDto,
} from '@smart-light/shared';
import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendData } from '../../lib/http';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../middlewares/authenticate';
import { AppError } from '../../utils/app-error';
import { errors } from '../../utils/errors';
import { recordAudit } from '../audit/audit.service';
import { getAuth, requireTenantId } from '../auth/auth.context';
import { workOrdersService } from '../work-orders/work-orders.service';
import {
  detectImageType,
  photoStorage,
  signedPhotoPath,
  verifyPhotoSignature,
} from './photo-storage';

const idParams = z.object({ id: z.uuid() });
const tenantQuery = z.object({ tenantId: z.uuid().optional() });
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
/** Status in which each kind of photo can be added. */
const ALLOWED_STATUS = {
  BEFORE: ['ASSIGNED', 'IN_PROGRESS'],
  AFTER: ['IN_PROGRESS', 'PENDING_VERIFICATION'],
} as const;

export const workOrderPhotosRouter = Router({ mergeParams: true });
workOrderPhotosRouter.use(authenticate);

workOrderPhotosRouter.post(
  '/:id/photos',
  express.raw({ type: ['image/*', 'application/octet-stream'], limit: MAX_PHOTO_BYTES }),
  async (req: Request, res: Response) => {
    const auth = getAuth(res);
    const { id } = idParams.parse(req.params);
    const query = uploadPhotoQuerySchema.parse(req.query);
    const tenantId = requireTenantId(auth, query.tenantId);
    const workOrder = await workOrdersService.get(auth, id, query.tenantId);
    if (workOrder.technician?.id !== auth.userId) {
      throw errors.forbidden('Only the assigned technician can add repair photos');
    }
    if (!(ALLOWED_STATUS[query.kind] as readonly string[]).includes(workOrder.status)) {
      throw errors.conflict(
        'INVALID_STATUS',
        `A ${query.kind.toLowerCase()} photo cannot be added to a ${workOrder.status.toLowerCase()} job`,
      );
    }
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const type = detectImageType(bytes);
    if (!type) {
      throw new AppError({
        statusCode: 415,
        code: 'UNSUPPORTED_IMAGE',
        message: 'Send a JPEG, PNG or WebP photo',
      });
    }
    const existing = await prisma.workOrderPhoto.count({
      where: { workOrderId: id, kind: query.kind },
    });
    if (existing >= MAX_PHOTOS_PER_KIND) {
      throw errors.conflict('TOO_MANY_PHOTOS', `At most ${MAX_PHOTOS_PER_KIND} photos per kind`);
    }

    const storage = photoStorage();
    const key = `${tenantId}/${id}/${randomUUID()}.${EXTENSIONS[type]}`;
    await storage.put(key, bytes, type);
    const photo = await prisma.workOrderPhoto.create({
      data: {
        workOrderId: id,
        kind: query.kind,
        storageKey: key,
        latitude: query.latitude ?? null,
        longitude: query.longitude ?? null,
        takenAt: query.takenAt ? new Date(query.takenAt) : new Date(),
        uploadedById: auth.userId,
      },
      include: { uploadedBy: { select: { name: true } } },
    });
    await recordAudit({
      tenantId,
      actorType: 'USER',
      actorId: auth.userId,
      action: 'work_order.photo_added',
      entityType: 'work_order',
      entityId: id,
      metadata: { photoId: photo.id, kind: query.kind, bytes: bytes.length },
      request: req,
    });
    sendData(res, toDto(photo), 201);
  },
);

workOrderPhotosRouter.get('/:id/photos', async (req: Request, res: Response) => {
  const auth = getAuth(res);
  const { id } = idParams.parse(req.params);
  const { tenantId } = tenantQuery.parse(req.query);
  await workOrdersService.get(auth, id, tenantId); // visibility check (404 otherwise)
  const photos = await prisma.workOrderPhoto.findMany({
    where: { workOrderId: id },
    orderBy: [{ kind: 'asc' }, { takenAt: 'asc' }],
    include: { uploadedBy: { select: { name: true } } },
  });
  sendData(res, photos.map(toDto));
});

function toDto(photo: {
  id: string;
  kind: 'BEFORE' | 'AFTER';
  takenAt: Date;
  latitude: number | null;
  longitude: number | null;
  uploadedBy: { name: string } | null;
}): WorkOrderPhotoDto {
  return {
    id: photo.id,
    kind: photo.kind,
    takenAt: photo.takenAt.toISOString(),
    latitude: photo.latitude,
    longitude: photo.longitude,
    uploadedBy: photo.uploadedBy?.name ?? null,
    url: signedPhotoPath(photo.id),
  };
}

/** Serves a photo to whoever holds an unexpired signed link (an <img> cannot send a token). */
export const photosRouter = Router();
const signedQuery = z.object({ exp: z.coerce.number().int(), sig: z.string().max(100) });

photosRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = idParams.parse(req.params);
  const query = signedQuery.safeParse(req.query);
  if (!query.success || !verifyPhotoSignature(id, query.data.exp, query.data.sig)) {
    throw errors.forbidden('This photo link is invalid or has expired');
  }
  const photo = await prisma.workOrderPhoto.findUnique({ where: { id } });
  if (!photo) throw errors.notFound('Photo');
  const bytes = await photoStorage().get(photo.storageKey);
  res.setHeader('Content-Type', detectImageType(bytes) ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.setHeader('Content-Disposition', 'inline');
  // Consoles on the same site (proxy in production, other localhost port in development).
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.send(bytes);
});

const TAG = 'Work orders';
registry.registerPath({
  method: 'post',
  path: '/api/v1/work-orders/{id}/photos',
  tags: [TAG],
  summary: 'Add a before/after repair photo (raw JPEG, PNG or WebP body, up to 5 MB)',
  security: AUTHENTICATED,
  request: {
    params: idParams,
    query: uploadPhotoQuerySchema,
    body: { content: { 'image/jpeg': { schema: z.string() } } },
  },
  responses: {
    201: { description: 'Stored', content: jsonContent(successEnvelope(workOrderPhotoSchema)) },
    ...errorResponses(400, 401, 403, 404, 409),
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/work-orders/{id}/photos',
  tags: [TAG],
  summary: 'Repair photos with short-lived links',
  security: AUTHENTICATED,
  request: { params: idParams, query: tenantQuery },
  responses: {
    200: {
      description: 'Photos',
      content: jsonContent(successEnvelope(z.array(workOrderPhotoSchema))),
    },
    ...errorResponses(401, 403, 404),
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/photos/{id}',
  tags: [TAG],
  summary: 'A repair photo, via the signed link from the photo list',
  request: { params: idParams, query: signedQuery },
  responses: {
    200: { description: 'Image', content: { 'image/jpeg': { schema: z.string() } } },
    ...errorResponses(403, 404),
  },
});
