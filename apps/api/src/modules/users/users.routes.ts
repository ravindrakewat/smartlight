import {
  createUserSchema,
  listUsersQuerySchema,
  paginatedEnvelope,
  resetPasswordSchema,
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
const MANAGERS = ['SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'AGENCY_MANAGER'] as const;

usersRouter.use(authenticate);
// Supervisors read the staff list to dispatch technicians; they cannot change accounts.
usersRouter.get('/', requireRoles(...MANAGERS, 'SUPERVISOR'), usersController.list);
usersRouter.post('/', requireRoles(...MANAGERS), usersController.create);
usersRouter.patch('/:id', requireRoles(...MANAGERS), usersController.update);
usersRouter.post('/:id/password-reset', requireRoles(...MANAGERS), usersController.resetPassword);

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

registry.registerPath({
  method: 'post',
  path: '/api/v1/users/{id}/password-reset',
  tags: [TAG],
  summary: 'Set a new password for a staff member (unlocks the account, signs them out everywhere)',
  security: AUTHENTICATED,
  request: {
    params: z.object({ id: z.uuid() }),
    body: { content: jsonContent(resetPasswordSchema) },
  },
  responses: {
    204: { description: 'Password changed' },
    ...errorResponses(400, 401, 403, 404),
  },
});
