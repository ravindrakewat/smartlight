import { createTenantSchema, updateTenantSchema } from '@smart-light/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendData } from '../../lib/http';
import { getAuth } from '../auth/auth.context';
import { tenantsService } from './tenants.service';

const idParams = z.object({ id: z.uuid() });
const slugParams = z.object({ slug: z.string().min(2).max(63) });

export const tenantsController = {
  async list(_req: Request, res: Response): Promise<void> {
    sendData(res, await tenantsService.list());
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createTenantSchema.parse(req.body);
    sendData(res, await tenantsService.create(input, getAuth(res), req), 201);
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParams.parse(req.params);
    const input = updateTenantSchema.parse(req.body);
    sendData(res, await tenantsService.update(id, input, getAuth(res), req));
  },

  async getPublic(req: Request, res: Response): Promise<void> {
    const { slug } = slugParams.parse(req.params);
    sendData(res, await tenantsService.getPublic(slug));
  },
};
