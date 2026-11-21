import {
  createUserSchema,
  listUsersQuerySchema,
  paginatedEnvelope,
  staffUserSchema,
  successEnvelope,
  updateUserSchema,
} from '@smart-light/shared';
import { Router } from 'express';
import { z } from 'zod';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';
import { authenticate } from '../../middlewares/authenticate';
import { requireRoles } from '../../middlewares/authorize';
import { usersController } from './users.controller';

export const usersRouter = Router();
usersRouter.use(authenticate, requireRoles('SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'AGENCY_MANAGER'));
usersRouter.get('/', usersController.list);
usersRouter.post('/', usersController.create);
usersRouter.patch('/:id', usersController.update);

const TAG = 'Users';

registry.registerPath({
  method: 'get',
  path: '/api/v1/users',
  tags: [TAG],
  summary: 'Staff accounts (agency managers see their own technicians only)',
  security: AUTHENTICATED,
  request: { query: listUsersQuerySchema },
  responses: {
    200: { description: 'Users', content: jsonContent(paginatedEnvelope(staffUserSchema)) },
    ...errorResponses(401, 403),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/users',
  tags: [TAG],
  summary: 'Create a staff account with an initial password',
  security: AUTHENTICATED,
  request: { body: { content: jsonContent(createUserSchema) } },
  responses: {
    201: { description: 'Created', content: jsonContent(successEnvelope(staffUserSchema)) },
    ...errorResponses(400, 401, 403, 409),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/users/{id}',
  tags: [TAG],
  summary: 'Update, re-role or disable a staff account (signs the user out everywhere)',
  security: AUTHENTICATED,
  request: { params: z.object({ id: z.uuid() }), body: { content: jsonContent(updateUserSchema) } },
  responses: {
    200: { description: 'Updated', content: jsonContent(successEnvelope(staffUserSchema)) },
    ...errorResponses(400, 401, 403, 404),
  },
});
