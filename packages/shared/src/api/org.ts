import { z } from 'zod';
import { MQTT_ID_PATTERN } from '../iot/topics';
import { paginationQuerySchema } from '../schemas/pagination';
import { lightStatusSchema } from './assets';
import { userRoleSchema } from './auth';

// ─── Tenants (municipal corporations) ────────────────────────────────────────

export const tenantStatusSchema = z.enum(['ONBOARDING', 'ACTIVE', 'SUSPENDED']);

export const tenantSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    code: z.string(),
    name: z.string(),
    nameHi: z.string(),
    status: tenantStatusSchema,
    timezone: z.string(),
    slaHours: z.number().int(),
    createdAt: z.iso.datetime(),
    stats: z.object({
      poles: z.number().int(),
      devices: z.number().int(),
      devicesOnline: z.number().int(),
      users: z.number().int(),
      /** Poles per light status, e.g. `{ ON: 120, FAULT: 3 }`; statuses with no poles are left out. */
      lights: z.partialRecord(lightStatusSchema, z.number().int()),
      /** Work orders not yet closed (open, assigned, in progress or awaiting verification). */
      openWorkOrders: z.number().int(),
    }),
  })
  .meta({ id: 'Tenant' });

export type TenantDto = z.infer<typeof tenantSchema>;

export const createTenantSchema = z
  .object({
    slug: z
      .string()
      .regex(MQTT_ID_PATTERN, { error: 'Lowercase letters, digits and hyphens only' })
      .meta({ example: 'bhopal-mc' }),
    code: z
      .string()
      .regex(/^[A-Z]{3}$/, { error: 'Exactly 3 capital letters' })
      .meta({ example: 'BPL' }),
    name: z.string().trim().min(3).max(120),
    nameHi: z.string().trim().min(2).max(120),
    slaHours: z.number().int().min(1).max(168).default(24),
  })
  .meta({ id: 'CreateTenantRequest' });

export const updateTenantSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    nameHi: z.string().trim().min(2).max(120),
    status: tenantStatusSchema,
    slaHours: z.number().int().min(1).max(168),
  })
  .partial()
  .meta({ id: 'UpdateTenantRequest' });

/** Public branding for the citizen portal of a city. */
export const publicTenantSchema = z
  .object({ slug: z.string(), code: z.string(), name: z.string(), nameHi: z.string() })
  .meta({ id: 'PublicTenant' });

// ─── Agencies (municipal staff or contractors) ───────────────────────────────

export const agencyTypeSchema = z.enum(['MUNICIPAL', 'CONTRACTOR']);

export const agencySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: agencyTypeSchema,
    contactPhone: z.string().nullable(),
    active: z.boolean(),
    technicianCount: z.number().int(),
  })
  .meta({ id: 'Agency' });

export type AgencyDto = z.infer<typeof agencySchema>;

/** Indian mobile number in E.164 form. */
export const indianPhoneSchema = z
  .string()
  .regex(/^\+91[6-9]\d{9}$/, { error: 'Use +91 followed by a 10-digit mobile number' })
  .meta({ example: '+919876543210' });

export const createAgencySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    type: agencyTypeSchema,
    contactPhone: indianPhoneSchema.optional(),
  })
  .meta({ id: 'CreateAgencyRequest' });

export const updateAgencySchema = createAgencySchema
  .extend({ active: z.boolean() })
  .partial()
  .meta({ id: 'UpdateAgencyRequest' });

// ─── Staff users ──────────────────────────────────────────────────────────────

export const userStatusSchema = z.enum(['ACTIVE', 'DISABLED']);

export const staffUserSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    role: userRoleSchema,
    status: userStatusSchema,
    tenantId: z.uuid().nullable(),
    agency: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    lastLoginAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'StaffUser' });

export type StaffUserDto = z.infer<typeof staffUserSchema>;

/**
 * Initial passwords: at least 10 characters with upper case, lower case and a digit.
 * The user should change it after the first sign-in.
 */
export const newPasswordSchema = z
  .string()
  .min(10, { error: 'At least 10 characters' })
  .max(128)
  .regex(/[a-z]/, { error: 'Needs a lower-case letter' })
  .regex(/[A-Z]/, { error: 'Needs an upper-case letter' })
  .regex(/\d/, { error: 'Needs a digit' });

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.email().transform((value) => value.trim().toLowerCase()),
    phone: indianPhoneSchema.optional(),
    role: userRoleSchema.exclude(['SUPER_ADMIN']),
    agencyId: z.uuid().optional(),
    password: newPasswordSchema,
    /** SUPER_ADMIN only: the municipality the user belongs to. */
    tenantId: z.uuid().optional(),
  })
  .meta({ id: 'CreateUserRequest' });

/** A signed-in staff member changes their own password. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: newPasswordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    error: 'The new password must be different',
  })
  .meta({ id: 'ChangePasswordRequest' });

/** An administrator sets a new password for a staff member who forgot theirs. */
export const resetPasswordSchema = z
  .object({ password: newPasswordSchema })
  .meta({ id: 'ResetPasswordRequest' });

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: indianPhoneSchema.nullable(),
    role: userRoleSchema.exclude(['SUPER_ADMIN']),
    status: userStatusSchema,
    agencyId: z.uuid().nullable(),
  })
  .partial()
  .meta({ id: 'UpdateUserRequest' });

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: userRoleSchema.optional(),
  agencyId: z.uuid().optional(),
  status: userStatusSchema.optional(),
  search: z.string().trim().max(100).optional(),
  tenantId: z.uuid().optional(),
});
