import { healthCheckDataSchema, successEnvelope } from '@smart-light/shared';
import { Router } from 'express';
import { jsonContent, registry } from '../../lib/openapi';
import { healthController } from './health.controller';

export const healthRouter = Router();

healthRouter.get('/', healthController.live);
healthRouter.get('/ready', healthController.ready);

const healthResponse = jsonContent(successEnvelope(healthCheckDataSchema));

registry.registerPath({
  method: 'get',
  path: '/api/health',
  tags: ['Health'],
  summary: 'Liveness probe',
  responses: { 200: { description: 'Process is running', content: healthResponse } },
});

registry.registerPath({
  method: 'get',
  path: '/api/health/ready',
  tags: ['Health'],
  summary: 'Readiness probe (checks the database)',
  responses: {
    200: { description: 'Ready', content: healthResponse },
    503: { description: 'A dependency is unavailable', content: healthResponse },
  },
});
