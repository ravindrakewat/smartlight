import {
  createPoleSchema,
  importPolesResultSchema,
  importPolesSchema,
  POLE_IMPORT_MAX_ROWS,
  listPolesQuerySchema,
  paginatedEnvelope,
  poleMapItemSchema,
  poleMapQuerySchema,
  poleSchema,
  successEnvelope,
  updatePoleSchema,
} from '@smart-light/shared';
import { Router } from 'express';
import { z } from 'zod';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';
import { ROLE_GROUPS } from '../../lib/roles';
import { authenticate } from '../../middlewares/authenticate';
import { requireRoles } from '../../middlewares/authorize';
import { polesController } from './poles.controller';

export const polesRouter = Router();
polesRouter.use(authenticate);
polesRouter.get('/', requireRoles(...ROLE_GROUPS.tenantReaders), polesController.list);
polesRouter.get('/map', requireRoles(...ROLE_GROUPS.tenantReaders), polesController.map);
polesRouter.get(
  '/by-code/:code',
  requireRoles(...ROLE_GROUPS.tenantReaders),
  polesController.getByCode,
);
polesRouter.get('/:id', requireRoles(...ROLE_GROUPS.tenantReaders), polesController.get);
polesRouter.post('/', requireRoles(...ROLE_GROUPS.assetEditors), polesController.create);
polesRouter.post('/import', requireRoles(...ROLE_GROUPS.assetEditors), polesController.import);
polesRouter.patch('/:id', requireRoles(...ROLE_GROUPS.assetEditors), polesController.update);

const TAG = 'Assets';
const tenantQuery = z.object({ tenantId: z.uuid().optional() });

registry.registerPath({
  method: 'get',
  path: '/api/v1/poles',
  tags: [TAG],
  summary: 'Search and list poles',
  security: AUTHENTICATED,
  request: { query: listPolesQuerySchema },
  responses: {
    200: { description: 'Poles', content: jsonContent(paginatedEnvelope(poleSchema)) },
    ...errorResponses(400, 401, 403),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/poles/map',
  tags: [TAG],
  summary: 'Compact pole list for the live map (optionally inside a bounding box)',
  security: AUTHENTICATED,
  request: { query: poleMapQuerySchema },
  responses: {
    200: {
      description: 'Map items',
      content: jsonContent(successEnvelope(z.array(poleMapItemSchema))),
    },
    ...errorResponses(400, 401, 403),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/poles/by-code/{code}',
  tags: [TAG],
  summary: 'Look up a pole by the code on its QR plate (technician scan)',
  security: AUTHENTICATED,
  request: {
    params: z.object({ code: z.string().meta({ example: 'IND-000001-8' }) }),
    query: tenantQuery,
  },
  responses: {
    200: { description: 'Pole', content: jsonContent(successEnvelope(poleSchema)) },
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/poles/{id}',
  tags: [TAG],
  summary: 'Pole details',
  security: AUTHENTICATED,
  request: { params: z.object({ id: z.uuid() }), query: tenantQuery },
  responses: {
    200: { description: 'Pole', content: jsonContent(successEnvelope(poleSchema)) },
    ...errorResponses(401, 403, 404),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/poles',
  tags: [TAG],
  summary: 'Register a pole — its QR code is generated automatically',
  security: AUTHENTICATED,
  request: { query: tenantQuery, body: { content: jsonContent(createPoleSchema) } },
  responses: {
    201: { description: 'Created', content: jsonContent(successEnvelope(poleSchema)) },
    ...errorResponses(400, 401, 403),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/poles/{id}',
  tags: [TAG],
  summary: 'Update or decommission a pole',
  security: AUTHENTICATED,
  request: {
    params: z.object({ id: z.uuid() }),
    query: tenantQuery,
    body: { content: jsonContent(updatePoleSchema) },
  },
  responses: {
    200: { description: 'Updated', content: jsonContent(successEnvelope(poleSchema)) },
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/poles/import',
  tags: [TAG],
  summary: `Bulk import up to ${POLE_IMPORT_MAX_ROWS} poles (all-or-nothing); codes are generated`,
  description:
    'Every row is validated first. If any row is invalid (bad coordinates, unknown zone code, coordinates that already exist) nothing is saved and the response lists the rows in error.details (field = rows.<index>.<column>).',
  security: AUTHENTICATED,
  request: { query: tenantQuery, body: { content: jsonContent(importPolesSchema) } },
  responses: {
    201: {
      description: 'Imported',
      content: jsonContent(successEnvelope(importPolesResultSchema)),
    },
    ...errorResponses(400, 401, 403),
  },
});
