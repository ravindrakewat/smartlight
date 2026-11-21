import { createUserSchema, listUsersQuerySchema, updateUserSchema } from '@smart-light/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendData, sendPage } from '../../lib/http';
import { getAuth } from '../auth/auth.context';
import { usersService } from './users.service';

const idParams = z.object({ id: z.uuid() });

export const usersController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = listUsersQuerySchema.parse(req.query);
    const { items, pagination } = await usersService.list(query, getAuth(res));
    sendPage(res, items, pagination);
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createUserSchema.parse(req.body);
    sendData(res, await usersService.create(input, getAuth(res), req), 201);
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParams.parse(req.params);
    const input = updateUserSchema.parse(req.body);
    sendData(res, await usersService.update(id, input, getAuth(res), req));
  },
};
