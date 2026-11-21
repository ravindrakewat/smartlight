import {
  complaintCreatedSchema,
  complaintSchema,
  createComplaintSchema,
  listComplaintsQuerySchema,
  paginatedEnvelope,
  publicComplaintSchema,
  publicPoleSchema,
  successEnvelope,
} from '@smart-light/shared';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendData, sendPage } from '../../lib/http';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';
import { ROLE_GROUPS } from '../../lib/roles';
import { authenticate } from '../../middlewares/authenticate';
import { requireRoles } from '../../middlewares/authorize';
import { getAuth } from '../auth/auth.context';
import { authenticateCitizen, getCitizen } from '../citizen-auth/citizen-auth.module';
import { complaintsService } from './complaints.service';

const numberParams = z.object({ number: z.string().min(5).max(30) });
const codeParams = z.object({ code: z.string().min(5).max(20) });

// ── Controller ──
const complaintsController = {
  async create(req: Request, res: Response): Promise<void> {
    const input = createComplaintSchema.parse(req.body);
    sendData(res, await complaintsService.create(getCitizen(res), input, req), 201);
  },
  async listMine(_req: Request, res: Response): Promise<void> {
    sendData(res, await complaintsService.listMine(getCitizen(res)));
  },
  async track(req: Request, res: Response): Promise<void> {
    sendData(res, await complaintsService.getPublic(numberParams.parse(req.params).number));
  },
  async publicPole(req: Request, res: Response): Promise<void> {
    sendData(res, await complaintsService.getPublicPole(codeParams.parse(req.params).code));
  },
  async listForStaff(req: Request, res: Response): Promise<void> {
    const query = listComplaintsQuerySchema.parse(req.query);
    const { items, pagination } = await complaintsService.listForStaff(getAuth(res), query);
    sendPage(res, items, pagination);
  },
};

// ── Routes ──
/** Mounted at /api/v1/public */
export const publicComplaintsRouter = Router();
publicComplaintsRouter.post('/complaints', authenticateCitizen, complaintsController.create);
publicComplaintsRouter.get('/complaints/mine', authenticateCitizen, complaintsController.listMine);
publicComplaintsRouter.get('/complaints/:number', complaintsController.track);
publicComplaintsRouter.get('/poles/:code', complaintsController.publicPole);

/** Mounted at /api/v1/complaints */
export const complaintsRouter = Router();
complaintsRouter.get(
  '/',
  authenticate,
  requireRoles(...ROLE_GROUPS.tenantManagers, 'AGENCY_MANAGER'),
  complaintsController.listForStaff,
);

// ── OpenAPI ──
registry.registerPath({
  method: 'post',
  path: '/api/v1/public/complaints',
  tags: ['Citizen'],
  summary: 'File a complaint (verified citizen). Joins an existing repair if one is open.',
  security: [{ cookieAuth: [] }],
  request: { body: { content: jsonContent(createComplaintSchema) } },
  responses: {
    201: { description: 'Filed', content: jsonContent(successEnvelope(complaintCreatedSchema)) },
    ...errorResponses(400, 401, 404, 429),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/public/complaints/mine',
  tags: ['Citizen'],
  summary: 'My complaints (verified citizen)',
  security: [{ cookieAuth: [] }],
  responses: {
    200: {
      description: 'Complaints',
      content: jsonContent(successEnvelope(z.array(publicComplaintSchema))),
    },
    ...errorResponses(401),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/public/complaints/{number}',
  tags: ['Citizen'],
  summary: 'Track a complaint by its number (no personal data returned)',
  request: { params: numberParams },
  responses: {
    200: { description: 'Complaint', content: jsonContent(successEnvelope(publicComplaintSchema)) },
    ...errorResponses(404),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/public/poles/{code}',
  tags: ['Citizen'],
  summary: 'Pole page opened by scanning its QR plate',
  request: { params: codeParams },
  responses: {
    200: { description: 'Pole', content: jsonContent(successEnvelope(publicPoleSchema)) },
    ...errorResponses(400, 404),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/complaints',
  tags: ['Work orders'],
  summary: 'Citizen complaints for the municipality (phone numbers masked)',
  security: AUTHENTICATED,
  request: { query: listComplaintsQuerySchema },
  responses: {
    200: { description: 'Complaints', content: jsonContent(paginatedEnvelope(complaintSchema)) },
    ...errorResponses(401, 403),
  },
});
