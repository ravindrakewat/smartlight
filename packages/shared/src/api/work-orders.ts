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

/** Repair checklist the technician ticks before completing a job. */
export const REPAIR_CHECKLIST = [
  'POWER_ISOLATED',
  'FAULT_IDENTIFIED',
  'PARTS_FITTED',
  'WIRING_EARTHING_CHECKED',
  'LIGHT_TESTED',
  'SITE_CLEARED',
] as const;
export const repairChecklistItemSchema = z.enum(REPAIR_CHECKLIST);
export type RepairChecklistItem = z.infer<typeof repairChecklistItemSchema>;

/** Spare part used on a repair. */
export const usedPartSchema = z.object({
  sparePartId: z.uuid(),
  quantity: z.number().int().min(1).max(100),
});

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
    checklist: z.array(z.string()),
    parts: z.array(
      z.object({
        id: z.uuid(),
        sparePartId: z.uuid(),
        code: z.string(),
        name: z.string(),
        unit: z.string(),
        quantity: z.number().int(),
      }),
    ),
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
    /** Checklist items done; optional so older app versions keep working. */
    checklist: z
      .array(repairChecklistItemSchema)
      .max(REPAIR_CHECKLIST.length)
      .default([])
      .transform((items) => [...new Set(items)]),
    parts: z
      .array(usedPartSchema)
      .max(20)
      .default([])
      .refine((parts) => new Set(parts.map((part) => part.sparePartId)).size === parts.length, {
        error: 'List each spare part once',
      }),
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

/** Most photos of each kind (before / after) on one work order. */
export const MAX_PHOTOS_PER_KIND = 6;
/** Largest accepted photo upload in bytes (5 MB). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const uploadPhotoQuerySchema = z.object({
  kind: z.enum(['BEFORE', 'AFTER']),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  /** When the photo was taken (phone clock); defaults to upload time. */
  takenAt: z.iso.datetime().optional(),
  tenantId: z.uuid().optional(),
});

export const workOrderPhotoSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(['BEFORE', 'AFTER']),
    takenAt: z.iso.datetime(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    uploadedBy: z.string().nullable(),
    /** Short-lived link relative to the API base (`/v1/photos/…`); expires in 10 minutes. */
    url: z.string(),
  })
  .meta({ id: 'WorkOrderPhoto' });
export type WorkOrderPhotoDto = z.infer<typeof workOrderPhotoSchema>;
