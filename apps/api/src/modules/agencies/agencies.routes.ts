import {
  agencySchema,
  createAgencySchema,
  successEnvelope,
  updateAgencySchema,
} from '@smart-light/shared';
import { Router } from 'express';
import { z } from 'zod';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';
import { ROLE_GROUPS } from '../../lib/roles';
import { authenticate } from '../../middlewares/authenticate';
import { requireRoles } from '../../middlewares/authorize';
import { agenciesController } from './agencies.controller';

export const agenciesRouter = Router();
agenciesRouter.use(authenticate);
agenciesRouter.get(
  '/',
  requireRoles(...ROLE_GROUPS.tenantManagers, 'AGENCY_MANAGER'),
  agenciesController.list,
);
agenciesRouter.post('/', requireRoles(...ROLE_GROUPS.admins), agenciesController.create);
agenciesRouter.patch('/:id', requireRoles(...ROLE_GROUPS.admins), agenciesController.update);

const TAG = 'Agencies';
const tenantQuery = z.object({ tenantId: z.uuid().optional() });

registry.registerPath({
  method: 'get',
  path: '/api/v1/agencies',
  tags: [TAG],
  summary: 'Maintenance agencies (municipal staff and contractors)',
  security: AUTHENTICATED,
  request: { query: tenantQuery },
  responses: {
    200: { description: 'Agencies', content: jsonContent(successEnvelope(z.array(agencySchema))) },
    ...errorResponses(401, 403),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/agencies',
  tags: [TAG],
  summary: 'Register an agency (MUNICIPAL_ADMIN)',
  security: AUTHENTICATED,
  request: { query: tenantQuery, body: { content: jsonContent(createAgencySchema) } },
  responses: {
    201: { description: 'Created', content: jsonContent(successEnvelope(agencySchema)) },
    ...errorResponses(400, 401, 403, 409),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/agencies/{id}',
  tags: [TAG],
  summary: 'Update or deactivate an agency (MUNICIPAL_ADMIN)',
  security: AUTHENTICATED,
  request: {
    params: z.object({ id: z.uuid() }),
    query: tenantQuery,
    body: { content: jsonContent(updateAgencySchema) },
  },
  responses: {
    200: { description: 'Updated', content: jsonContent(successEnvelope(agencySchema)) },
    ...errorResponses(400, 401, 403, 404),
  },
});
