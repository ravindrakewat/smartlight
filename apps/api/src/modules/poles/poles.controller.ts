import {
  createPoleSchema,
  listPolesQuerySchema,
  poleMapQuerySchema,
  updatePoleSchema,
} from '@smart-light/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendData, sendPage } from '../../lib/http';
import { getAuth, requireTenantId } from '../auth/auth.context';
import { polesService } from './poles.service';

const tenantQuery = z.object({ tenantId: z.uuid().optional() });
const idParams = z.object({ id: z.uuid() });
const codeParams = z.object({ code: z.string().min(5).max(20) });

function tenantOf(req: Request, res: Response): string {
  return requireTenantId(getAuth(res), tenantQuery.parse(req.query).tenantId);
}

export const polesController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = listPolesQuerySchema.parse(req.query);
    const { items, pagination } = await polesService.list(tenantOf(req, res), query);
    sendPage(res, items, pagination);
  },

  async map(req: Request, res: Response): Promise<void> {
    const query = poleMapQuerySchema.parse(req.query);
    sendData(res, await polesService.map(tenantOf(req, res), query));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { id } = idParams.parse(req.params);
    sendData(res, await polesService.get(tenantOf(req, res), id));
  },

  async getByCode(req: Request, res: Response): Promise<void> {
    const { code } = codeParams.parse(req.params);
    sendData(res, await polesService.getByCode(tenantOf(req, res), code));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createPoleSchema.parse(req.body);
    sendData(res, await polesService.create(tenantOf(req, res), input, getAuth(res), req), 201);
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParams.parse(req.params);
    const input = updatePoleSchema.parse(req.body);
    sendData(res, await polesService.update(tenantOf(req, res), id, input, getAuth(res), req));
  },
};
