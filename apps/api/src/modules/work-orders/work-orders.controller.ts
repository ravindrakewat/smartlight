import {
  assignWorkOrderSchema,
  cancelWorkOrderSchema,
  completeWorkOrderSchema,
  createWorkOrderSchema,
  listWorkOrdersQuerySchema,
  startWorkOrderSchema,
  verifyWorkOrderSchema,
} from '@smart-light/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendData, sendPage } from '../../lib/http';
import { getAuth } from '../auth/auth.context';
import { workOrdersService } from './work-orders.service';

const idParams = z.object({ id: z.uuid() });
const tenantQuery = z.object({ tenantId: z.uuid().optional() });

function ids(req: Request): { id: string; tenantId?: string } {
  return { ...idParams.parse(req.params), ...tenantQuery.parse(req.query) };
}

export const workOrdersController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = listWorkOrdersQuerySchema.parse(req.query);
    const { items, pagination } = await workOrdersService.list(getAuth(res), query);
    sendPage(res, items, pagination);
  },

  async get(req: Request, res: Response): Promise<void> {
    const { id, tenantId } = ids(req);
    sendData(res, await workOrdersService.get(getAuth(res), id, tenantId));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createWorkOrderSchema.parse(req.body);
    const { tenantId } = tenantQuery.parse(req.query);
    sendData(res, await workOrdersService.create(getAuth(res), input, req, tenantId), 201);
  },

  async assign(req: Request, res: Response): Promise<void> {
    const { id, tenantId } = ids(req);
    const input = assignWorkOrderSchema.parse(req.body);
    sendData(res, await workOrdersService.assign(getAuth(res), id, input, req, tenantId));
  },

  async start(req: Request, res: Response): Promise<void> {
    const { id } = idParams.parse(req.params);
    sendData(
      res,
      await workOrdersService.start(getAuth(res), id, startWorkOrderSchema.parse(req.body)),
    );
  },

  async complete(req: Request, res: Response): Promise<void> {
    const { id } = idParams.parse(req.params);
    const input = completeWorkOrderSchema.parse(req.body);
    sendData(res, await workOrdersService.complete(getAuth(res), id, input));
  },

  async verify(req: Request, res: Response): Promise<void> {
    const { id, tenantId } = ids(req);
    const input = verifyWorkOrderSchema.parse(req.body);
    sendData(res, await workOrdersService.verify(getAuth(res), id, input, req, tenantId));
  },

  async cancel(req: Request, res: Response): Promise<void> {
    const { id, tenantId } = ids(req);
    const { reason } = cancelWorkOrderSchema.parse(req.body);
    sendData(res, await workOrdersService.cancel(getAuth(res), id, reason, req, tenantId));
  },
};
