/**
 * Spare parts inventory of a municipality:
 *   GET   /v1/spare-parts                 parts with stock and 30-day use (all staff; technicians pick from it)
 *   POST  /v1/spare-parts                 add a part, optionally with opening stock (asset editors)
 *   PATCH /v1/spare-parts/:id             rename, reorder level, stop stocking (asset editors)
 *   POST  /v1/spare-parts/:id/stock       receive stock or correct a count (asset editors)
 *   GET   /v1/spare-parts/:id/movements   stock ledger (managers)
 *
 * Field use is recorded when a technician completes a job (work-orders service).
 */
import { Prisma } from '@smart-light/db';
import {
  createSparePartSchema,
  listSparePartsQuerySchema,
  sparePartSchema,
  stockMovementInputSchema,
  stockMovementSchema,
  successEnvelope,
  tenantScopeQuerySchema,
  updateSparePartSchema,
  type SparePartDto,
  type StockMovementDto,
} from '@smart-light/shared';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendData } from '../../lib/http';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';
import { prisma } from '../../lib/prisma';
import { ROLE_GROUPS } from '../../lib/roles';
import { authenticate } from '../../middlewares/authenticate';
import { requireRoles } from '../../middlewares/authorize';
import { errors } from '../../utils/errors';
import { recordAudit } from '../audit/audit.service';
import { getAuth, requireTenantId } from '../auth/auth.context';

const DAY_MS = 24 * 60 * 60 * 1000;
const idParams = z.object({ id: z.uuid() });

type PartRow = Prisma.SparePartGetPayload<object>;

function toDto(row: PartRow, usedLast30Days: number): SparePartDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameHi: row.nameHi,
    unit: row.unit,
    stockQty: row.stockQty,
    minStock: row.minStock,
    lowStock: row.stockQty <= row.minStock,
    active: row.active,
    usedLast30Days,
  };
}

async function usedSince(partIds: string[]): Promise<Map<string, number>> {
  if (partIds.length === 0) return new Map();
  const rows = await prisma.workOrderPart.groupBy({
    by: ['sparePartId'],
    where: { sparePartId: { in: partIds }, createdAt: { gte: new Date(Date.now() - 30 * DAY_MS) } },
    _sum: { quantity: true },
  });
  return new Map(rows.map((row) => [row.sparePartId, row._sum.quantity ?? 0]));
}

async function findPart(id: string, tenantId: string): Promise<PartRow> {
  const part = await prisma.sparePart.findFirst({ where: { id, tenantId } });
  if (!part) throw errors.notFound('Spare part');
  return part;
}

const tenantOf = (req: Request, res: Response) =>
  requireTenantId(getAuth(res), tenantScopeQuerySchema.parse(req.query).tenantId);

export const sparePartsRouter = Router();
sparePartsRouter.use(authenticate);

sparePartsRouter.get(
  '/',
  requireRoles(...ROLE_GROUPS.tenantReaders),
  async (req: Request, res: Response) => {
    const query = listSparePartsQuerySchema.parse(req.query);
    const tenantId = requireTenantId(getAuth(res), query.tenantId);
    const rows = await prisma.sparePart.findMany({
      where: { tenantId, ...(query.all ? {} : { active: true }) },
      orderBy: [{ active: 'desc' }, { code: 'asc' }],
    });
    const used = await usedSince(rows.map((row) => row.id));
    sendData(
      res,
      rows.map((row) => toDto(row, used.get(row.id) ?? 0)),
    );
  },
);

sparePartsRouter.post(
  '/',
  requireRoles(...ROLE_GROUPS.assetEditors),
  async (req: Request, res: Response) => {
    const auth = getAuth(res);
    const tenantId = tenantOf(req, res);
    const { openingStock, ...input } = createSparePartSchema.parse(req.body);
    try {
      const part = await prisma.$transaction(async (tx) => {
        const created = await tx.sparePart.create({
          data: { ...input, tenantId, stockQty: openingStock },
        });
        if (openingStock > 0) {
          await tx.stockMovement.create({
            data: {
              sparePartId: created.id,
              kind: 'RECEIVED',
              quantity: openingStock,
              note: 'Opening stock',
              actorUserId: auth.userId,
            },
          });
        }
        await recordAudit(
          {
            tenantId,
            actorType: 'USER',
            actorId: auth.userId,
            action: 'inventory.part_created',
            entityType: 'spare_part',
            entityId: created.id,
            metadata: { code: created.code, openingStock },
            request: req,
          },
          tx,
        );
        return created;
      });
      sendData(res, toDto(part, 0), 201);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw errors.conflict('SPARE_PART_EXISTS', 'A spare part with this code already exists');
      }
      throw error;
    }
  },
);

sparePartsRouter.patch(
  '/:id',
  requireRoles(...ROLE_GROUPS.assetEditors),
  async (req: Request, res: Response) => {
    const auth = getAuth(res);
    const tenantId = tenantOf(req, res);
    const { id } = idParams.parse(req.params);
    const input = updateSparePartSchema.parse(req.body);
    await findPart(id, tenantId);
    const part = await prisma.sparePart.update({ where: { id }, data: input });
    await recordAudit({
      tenantId,
      actorType: 'USER',
      actorId: auth.userId,
      action: 'inventory.part_updated',
      entityType: 'spare_part',
      entityId: id,
      metadata: input,
      request: req,
    });
    sendData(res, toDto(part, (await usedSince([id])).get(id) ?? 0));
  },
);

sparePartsRouter.post(
  '/:id/stock',
  requireRoles(...ROLE_GROUPS.assetEditors),
  async (req: Request, res: Response) => {
    const auth = getAuth(res);
    const tenantId = tenantOf(req, res);
    const { id } = idParams.parse(req.params);
    const input = stockMovementInputSchema.parse(req.body);
    await findPart(id, tenantId);
    const part = await prisma.$transaction(async (tx) => {
      await tx.stockMovement.create({
        data: {
          sparePartId: id,
          kind: input.kind,
          quantity: input.quantity,
          note: input.note ?? null,
          actorUserId: auth.userId,
        },
      });
      const updated = await tx.sparePart.update({
        where: { id },
        data: { stockQty: { increment: input.quantity } },
      });
      await recordAudit(
        {
          tenantId,
          actorType: 'USER',
          actorId: auth.userId,
          action:
            input.kind === 'RECEIVED' ? 'inventory.stock_received' : 'inventory.stock_adjusted',
          entityType: 'spare_part',
          entityId: id,
          metadata: { quantity: input.quantity, note: input.note ?? null },
          request: req,
        },
        tx,
      );
      return updated;
    });
    sendData(res, toDto(part, (await usedSince([id])).get(id) ?? 0));
  },
);

sparePartsRouter.get(
  '/:id/movements',
  requireRoles(...ROLE_GROUPS.tenantManagers),
  async (req: Request, res: Response) => {
    const tenantId = tenantOf(req, res);
    const { id } = idParams.parse(req.params);
    await findPart(id, tenantId);
    const rows = await prisma.stockMovement.findMany({
      where: { sparePartId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { actor: { select: { name: true } } },
    });
    const workOrderIds = rows.flatMap((row) => (row.workOrderId ? [row.workOrderId] : []));
    const numbers = new Map(
      (
        await prisma.workOrder.findMany({
          where: { id: { in: workOrderIds }, tenantId },
          select: { id: true, number: true },
        })
      ).map((row) => [row.id, row.number]),
    );
    const movements: StockMovementDto[] = rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      quantity: row.quantity,
      note: row.note,
      workOrderNumber: row.workOrderId ? (numbers.get(row.workOrderId) ?? null) : null,
      actorName: row.actor?.name ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
    sendData(res, movements);
  },
);

const TAG = 'Inventory';
registry.registerPath({
  method: 'get',
  path: '/api/v1/spare-parts',
  tags: [TAG],
  summary: 'Spare parts with current stock and use in the last 30 days',
  security: AUTHENTICATED,
  request: { query: listSparePartsQuerySchema },
  responses: {
    200: { description: 'Parts', content: jsonContent(successEnvelope(z.array(sparePartSchema))) },
    ...errorResponses(401, 403),
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/spare-parts',
  tags: [TAG],
  summary: 'Add a spare part (asset editors)',
  security: AUTHENTICATED,
  request: {
    query: tenantScopeQuerySchema,
    body: { content: jsonContent(createSparePartSchema) },
  },
  responses: {
    201: { description: 'Created', content: jsonContent(successEnvelope(sparePartSchema)) },
    ...errorResponses(400, 401, 403, 409),
  },
});
registry.registerPath({
  method: 'patch',
  path: '/api/v1/spare-parts/{id}',
  tags: [TAG],
  summary: 'Update a spare part (asset editors)',
  security: AUTHENTICATED,
  request: {
    params: idParams,
    query: tenantScopeQuerySchema,
    body: { content: jsonContent(updateSparePartSchema) },
  },
  responses: {
    200: { description: 'Updated', content: jsonContent(successEnvelope(sparePartSchema)) },
    ...errorResponses(400, 401, 403, 404),
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/spare-parts/{id}/stock',
  tags: [TAG],
  summary: 'Receive stock or correct a count (asset editors; corrections need a note)',
  security: AUTHENTICATED,
  request: {
    params: idParams,
    query: tenantScopeQuerySchema,
    body: { content: jsonContent(stockMovementInputSchema) },
  },
  responses: {
    200: { description: 'Updated stock', content: jsonContent(successEnvelope(sparePartSchema)) },
    ...errorResponses(400, 401, 403, 404),
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/spare-parts/{id}/movements',
  tags: [TAG],
  summary: 'Stock ledger of a part (latest 100)',
  security: AUTHENTICATED,
  request: { params: idParams, query: tenantScopeQuerySchema },
  responses: {
    200: {
      description: 'Movements',
      content: jsonContent(successEnvelope(z.array(stockMovementSchema))),
    },
    ...errorResponses(401, 403, 404),
  },
});
