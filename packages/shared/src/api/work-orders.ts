import { z } from 'zod';
import { latitudeSchema, lightStatusSchema, longitudeSchema } from './assets';
import { paginationQuerySchema } from '../schemas/pagination';

export const WORK_ORDER_STATUSES = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'PENDING_VERIFICATION',
  'RESOLVED',
  'CANCELLED',
] as const;
export const workOrderStatusSchema = z.enum(WORK_ORDER_STATUSES);
export type WorkOrderStatusName = z.infer<typeof workOrderStatusSchema>;

export const workOrderPrioritySchema = z.enum(['CRITICAL', 'HIGH', 'NORMAL', 'LOW']);
export const workOrderSourceSchema = z.enum([
  'IOT_ALERT',
  'CITIZEN_COMPLAINT',
  'INSPECTION',
  'MANUAL',
]);

/** What the technician did. Drives maintenance reports and spare-part planning. */
export const RESOLUTION_CODES = [
  'LAMP_REPLACED',
  'DRIVER_REPLACED',
  'CONTROLLER_REPLACED',
  'WIRING_REPAIRED',
  'FUSE_REPLACED',
  'POWER_RESTORED',
  'POLE_REPAIRED',
  'NO_FAULT_FOUND',
  'OTHER',
] as const;
export const resolutionCodeSchema = z.enum(RESOLUTION_CODES);

export const workOrderEventTypeSchema = z.enum([
  'CREATED',
  'ASSIGNED',
  'STARTED',
  'COMPLETED',
  'VERIFIED',
  'VERIFICATION_FAILED',
  'REOPENED',
  'CANCELLED',
  'COMMENT',
  'SLA_BREACHED',
]);

export const workOrderSummarySchema = z
  .object({
    id: z.uuid(),
    number: z.string().meta({ example: 'IND-W-000042' }),
    status: workOrderStatusSchema,
    priority: workOrderPrioritySchema,
    source: workOrderSourceSchema,
    faultType: z.string().nullable(),
    pole: z.object({
      id: z.uuid(),
      code: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      address: z.string().nullable(),
      zoneName: z.string().nullable(),
      lightStatus: lightStatusSchema,
      hasController: z.boolean(),
    }),
    agency: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    technician: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    complaintCount: z.number().int(),
    slaDueAt: z.iso.datetime(),
    /** Past the deadline and not yet resolved or cancelled. */
    overdue: z.boolean(),
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    resolvedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'WorkOrderSummary' });

export type WorkOrderSummaryDto = z.infer<typeof workOrderSummarySchema>;

export const workOrderEventSchema = z
  .object({
    id: z.uuid(),
    type: workOrderEventTypeSchema,
    actorName: z.string().nullable(),
    note: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'WorkOrderEvent' });

export const workOrderDetailSchema = workOrderSummarySchema
  .extend({
    description: z.string().nullable(),
    resolutionCode: resolutionCodeSchema.nullable(),
    resolutionNotes: z.string().nullable(),
    verificationMethod: z.enum(['IOT_TELEMETRY', 'SUPERVISOR']).nullable(),
    startedAt: z.iso.datetime().nullable(),
    events: z.array(workOrderEventSchema),
  })
  .meta({ id: 'WorkOrderDetail' });

export type WorkOrderDetailDto = z.infer<typeof workOrderDetailSchema>;

export const listWorkOrdersQuerySchema = paginationQuerySchema.extend({
  status: workOrderStatusSchema.optional(),
  /** Comma-free shortcut: open = everything not resolved or cancelled. */
  open: z.stringbool().optional(),
  overdue: z.stringbool().optional(),
  agencyId: z.uuid().optional(),
  technicianId: z.uuid().optional(),
  tenantId: z.uuid().optional(),
});

export const createWorkOrderSchema = z
  .object({
    poleCode: z.string().trim().min(5).max(20),
    faultType: z.string().trim().max(60).optional(),
    description: z.string().trim().max(1000).optional(),
    priority: workOrderPrioritySchema.default('NORMAL'),
  })
  .meta({ id: 'CreateWorkOrderRequest' });

export const assignWorkOrderSchema = z
  .object({
    agencyId: z.uuid().optional(),
    technicianId: z.uuid().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.agencyId !== undefined || value.technicianId !== undefined, {
    error: 'Choose an agency or a technician',
  })
  .meta({ id: 'AssignWorkOrderRequest' });

/** GPS position reported by the technician's phone. */
export const fieldLocationSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  /** Reported GPS accuracy in metres. */
  accuracyM: z.number().min(0).max(5000).default(30),
});

export const startWorkOrderSchema = fieldLocationSchema.meta({ id: 'StartWorkOrderRequest' });

export const completeWorkOrderSchema = fieldLocationSchema
  .extend({
    resolutionCode: resolutionCodeSchema,
    notes: z.string().trim().max(1000).optional(),
  })
  .meta({ id: 'CompleteWorkOrderRequest' });

export const verifyWorkOrderSchema = z
  .object({
    approved: z.boolean(),
    note: z.string().trim().max(500).optional(),
  })
  .meta({ id: 'VerifyWorkOrderRequest' });

export const cancelWorkOrderSchema = z
  .object({ reason: z.string().trim().min(5).max(500) })
  .meta({ id: 'CancelWorkOrderRequest' });

/** Technicians must be this close to the pole to start or complete work. */
export const ON_SITE_RADIUS_M = 100;
