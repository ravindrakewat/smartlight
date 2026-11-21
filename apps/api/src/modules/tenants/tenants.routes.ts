import {
  createTenantSchema,
  publicTenantSchema,
  successEnvelope,
  tenantSchema,
  updateTenantSchema,
} from '@smart-light/shared';
import { Router } from 'express';
import { z } from 'zod';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';
import { authenticate } from '../../middlewares/authenticate';
import { requireRoles } from '../../middlewares/authorize';
import { tenantsController } from './tenants.controller';

export const tenantsRouter = Router();
tenantsRouter.use(authenticate, requireRoles('SUPER_ADMIN'));
tenantsRouter.get('/', tenantsController.list);
tenantsRouter.post('/', tenantsController.create);
tenantsRouter.patch('/:id', tenantsController.update);

export const publicTenantsRouter = Router();
publicTenantsRouter.get('/:slug', tenantsController.getPublic);

const TAG = 'Municipalities';

registry.registerPath({
  method: 'get',
  path: '/api/v1/tenants',
  tags: [TAG],
  summary: 'List municipalities with fleet statistics (SUPER_ADMIN)',
  security: AUTHENTICATED,
  responses: {
    200: {
      description: 'Municipalities',
      content: jsonContent(successEnvelope(z.array(tenantSchema))),
    },
    ...errorResponses(401, 403),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/tenants',
  tags: [TAG],
  summary: 'Onboard a municipality (SUPER_ADMIN)',
  security: AUTHENTICATED,
  request: { body: { content: jsonContent(createTenantSchema) } },
  responses: {
    201: { description: 'Created', content: jsonContent(successEnvelope(tenantSchema)) },
    ...errorResponses(400, 401, 403, 409),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/tenants/{id}',
  tags: [TAG],
  summary: 'Update or suspend a municipality (SUPER_ADMIN)',
  security: AUTHENTICATED,
  request: {
    params: z.object({ id: z.uuid() }),
    body: { content: jsonContent(updateTenantSchema) },
  },
  responses: {
    200: { description: 'Updated', content: jsonContent(successEnvelope(tenantSchema)) },
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/public/tenants/{slug}',
  tags: ['Public'],
  summary: 'Citizen-portal branding for a municipality',
  request: { params: z.object({ slug: z.string() }) },
  responses: {
    200: { description: 'Municipality', content: jsonContent(successEnvelope(publicTenantSchema)) },
    ...errorResponses(404),
  },
});
