import {
  assignWorkOrderSchema,
  cancelWorkOrderSchema,
  completeWorkOrderSchema,
  createWorkOrderSchema,
  listWorkOrdersQuerySchema,
  paginatedEnvelope,
  startWorkOrderSchema,
  successEnvelope,
  verifyWorkOrderSchema,
  workOrderDetailSchema,
  workOrderSummarySchema,
} from '@smart-light/shared';
import { Router } from 'express';
import { z } from 'zod';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';
import { ROLE_GROUPS } from '../../lib/roles';
import { authenticate } from '../../middlewares/authenticate';
import { requireRoles } from '../../middlewares/authorize';
import { workOrdersController } from './work-orders.controller';

const VERIFIERS = ['SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'SUPERVISOR'] as const;

export const workOrdersRouter = Router();
workOrdersRouter.use(authenticate);
workOrdersRouter.get('/', requireRoles(...ROLE_GROUPS.tenantReaders), workOrdersController.list);
workOrdersRouter.get('/:id', requireRoles(...ROLE_GROUPS.tenantReaders), workOrdersController.get);
workOrdersRouter.post(
  '/',
  requireRoles(...ROLE_GROUPS.tenantManagers),
  workOrdersController.create,
);
workOrdersRouter.post(
  '/:id/assign',
  requireRoles(...VERIFIERS, 'AGENCY_MANAGER'),
  workOrdersController.assign,
);
workOrdersRouter.post('/:id/start', requireRoles('TECHNICIAN'), workOrdersController.start);
workOrdersRouter.post('/:id/complete', requireRoles('TECHNICIAN'), workOrdersController.complete);
workOrdersRouter.post('/:id/verify', requireRoles(...VERIFIERS), workOrdersController.verify);
workOrdersRouter.post('/:id/cancel', requireRoles(...VERIFIERS), workOrdersController.cancel);

const TAG = 'Work orders';
const idParams = z.object({ id: z.uuid() });
const detail = jsonContent(successEnvelope(workOrderDetailSchema));

registry.registerPath({
  method: 'get',
  path: '/api/v1/work-orders',
  tags: [TAG],
  summary: 'Work orders, most urgent SLA first (technicians see only their own)',
  security: AUTHENTICATED,
  request: { query: listWorkOrdersQuerySchema },
  responses: {
    200: {
      description: 'Work orders',
      content: jsonContent(paginatedEnvelope(workOrderSummarySchema)),
    },
    ...errorResponses(400, 401, 403),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/work-orders/{id}',
  tags: [TAG],
  summary: 'Work order with its full timeline',
  security: AUTHENTICATED,
  request: { params: idParams },
  responses: {
    200: { description: 'Work order', content: detail },
    ...errorResponses(401, 403, 404),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/work-orders',
  tags: [TAG],
  summary: 'Raise a work order for a pole (control room / supervisor)',
  security: AUTHENTICATED,
  request: { body: { content: jsonContent(createWorkOrderSchema) } },
  responses: {
    201: { description: 'Created', content: detail },
    ...errorResponses(400, 401, 403, 404, 409),
  },
});

const actions: { path: string; summary: string; body: z.ZodType }[] = [
  { path: 'assign', summary: 'Assign to an agency and/or technician', body: assignWorkOrderSchema },
  {
    path: 'start',
    summary: 'Technician starts work (must be within 100 m of the pole)',
    body: startWorkOrderSchema,
  },
  {
    path: 'complete',
    summary: 'Technician completes work — goes to verification (IoT or supervisor)',
    body: completeWorkOrderSchema,
  },
  { path: 'verify', summary: 'Supervisor accepts or rejects the fix', body: verifyWorkOrderSchema },
  { path: 'cancel', summary: 'Cancel with a reason', body: cancelWorkOrderSchema },
];

for (const action of actions) {
  registry.registerPath({
    method: 'post',
    path: `/api/v1/work-orders/{id}/${action.path}`,
    tags: [TAG],
    summary: action.summary,
    security: AUTHENTICATED,
    request: { params: idParams, body: { content: jsonContent(action.body) } },
    responses: {
      200: { description: 'Updated', content: detail },
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });
}
