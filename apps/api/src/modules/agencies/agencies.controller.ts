import { createAgencySchema, updateAgencySchema } from '@smart-light/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendData } from '../../lib/http';
import { getAuth, requireTenantId } from '../auth/auth.context';
import { agenciesService } from './agencies.service';

const tenantQuery = z.object({ tenantId: z.uuid().optional() });
const idParams = z.object({ id: z.uuid() });

function tenantOf(req: Request, res: Response): string {
  return requireTenantId(getAuth(res), tenantQuery.parse(req.query).tenantId);
}

export const agenciesController = {
  async list(req: Request, res: Response): Promise<void> {
    sendData(res, await agenciesService.list(tenantOf(req, res), getAuth(res)));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createAgencySchema.parse(req.body);
    sendData(res, await agenciesService.create(tenantOf(req, res), input, getAuth(res), req), 201);
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParams.parse(req.params);
    const input = updateAgencySchema.parse(req.body);
    sendData(res, await agenciesService.update(tenantOf(req, res), id, input, getAuth(res), req));
  },
};
