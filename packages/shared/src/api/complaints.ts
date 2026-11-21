import { z } from 'zod';
import { lightStatusSchema, latitudeSchema, longitudeSchema } from './assets';
import { indianPhoneSchema } from './org';
import { paginationQuerySchema } from '../schemas/pagination';

// ─── Citizen OTP sign-in ──────────────────────────────────────────────────────

export const OTP_LENGTH = 6;

export const otpRequestSchema = z.object({ phone: indianPhoneSchema }).meta({ id: 'OtpRequest' });

export const otpVerifySchema = z
  .object({
    phone: indianPhoneSchema,
    code: z.string().regex(/^\d{6}$/, { error: 'Enter the 6-digit code' }),
  })
  .meta({ id: 'OtpVerify' });

export const citizenSessionSchema = z
  .object({
    citizen: z.object({ id: z.uuid(), phone: z.string(), name: z.string().nullable() }),
    /** Seconds until the citizen session expires. */
    expiresIn: z.number().int(),
  })
  .meta({ id: 'CitizenSession' });

export const CITIZEN_COOKIE = 'sl_ct';

// ─── Complaints ───────────────────────────────────────────────────────────────

export const COMPLAINT_CATEGORIES = [
  'LIGHT_OFF',
  'FLICKERING',
  'DAY_BURNING',
  'DAMAGED_POLE',
  'EXPOSED_WIRING',
  'OTHER',
] as const;
export const complaintCategorySchema = z.enum(COMPLAINT_CATEGORIES);
export type ComplaintCategoryName = z.infer<typeof complaintCategorySchema>;

export const complaintStatusSchema = z.enum(['SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED']);
export type ComplaintStatusName = z.infer<typeof complaintStatusSchema>;

export const createComplaintSchema = z
  .object({
    /** Code from the pole's QR plate. Either this, or tenantSlug + location. */
    poleCode: z.string().trim().min(5).max(20).optional(),
    tenantSlug: z.string().min(2).max(63).optional(),
    category: complaintCategorySchema,
    description: z.string().trim().max(500).optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    name: z.string().trim().min(2).max(80).optional(),
  })
  .refine(
    (value) =>
      value.poleCode !== undefined ||
      (value.tenantSlug !== undefined &&
        value.latitude !== undefined &&
        value.longitude !== undefined),
    { error: 'Provide the pole code, or the city and your location', path: ['poleCode'] },
  )
  .meta({ id: 'CreateComplaintRequest' });

export type CreateComplaintInput = z.input<typeof createComplaintSchema>;

/** Public, privacy-safe view used for tracking by complaint number. */
export const publicComplaintSchema = z
  .object({
    number: z.string().meta({ example: 'IND-C-000123' }),
    status: complaintStatusSchema,
    category: complaintCategorySchema,
    poleCode: z.string().nullable(),
    tenant: z.object({ slug: z.string(), name: z.string(), nameHi: z.string() }),
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
    /** Repair deadline of the linked work order. */
    slaDueAt: z.iso.datetime().nullable(),
    timeline: z.array(
      z.object({
        status: z.enum(['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED']),
        at: z.iso.datetime(),
      }),
    ),
  })
  .meta({ id: 'PublicComplaint' });

export type PublicComplaintDto = z.infer<typeof publicComplaintSchema>;

export const complaintCreatedSchema = z
  .object({
    complaint: publicComplaintSchema,
    /** True when the fault was already reported and the complaint joined the existing repair. */
    joinedExistingRepair: z.boolean(),
  })
  .meta({ id: 'ComplaintCreated' });

/** What a citizen sees after scanning a pole's QR plate. */
export const publicPoleSchema = z
  .object({
    code: z.string(),
    tenant: z.object({ slug: z.string(), name: z.string(), nameHi: z.string() }),
    zoneName: z.string().nullable(),
    address: z.string().nullable(),
    latitude: z.number(),
    longitude: z.number(),
    lightStatus: lightStatusSchema,
    lightStatusAt: z.iso.datetime().nullable(),
    openRepair: z
      .object({ status: z.string(), slaDueAt: z.iso.datetime(), reportedAt: z.iso.datetime() })
      .nullable(),
  })
  .meta({ id: 'PublicPole' });

export type PublicPoleDto = z.infer<typeof publicPoleSchema>;

/** Staff view of a complaint. */
export const complaintSchema = z
  .object({
    id: z.uuid(),
    number: z.string(),
    status: complaintStatusSchema,
    category: complaintCategorySchema,
    description: z.string().nullable(),
    source: z.enum(['WEB', 'MOBILE', 'SMS', 'WHATSAPP', 'CALL_CENTRE']),
    poleCode: z.string().nullable(),
    workOrderNumber: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    citizenPhoneMasked: z.string().nullable(),
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'Complaint' });

export type ComplaintDto = z.infer<typeof complaintSchema>;

export const listComplaintsQuerySchema = paginationQuerySchema.extend({
  status: complaintStatusSchema.optional(),
  tenantId: z.uuid().optional(),
});

/** +919876543210 → +91 98XXXXXX10 (staff never need the full number on screen). */
export function maskPhone(phone: string): string {
  if (!/^\+91\d{10}$/.test(phone)) {
    return '••••';
  }
  return `+91 ${phone.slice(3, 5)}XXXXXX${phone.slice(-2)}`;
}
