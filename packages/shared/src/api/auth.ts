import { z } from 'zod';

/** Staff roles. Mirrors the `UserRole` database enum. */
export const USER_ROLES = [
  'SUPER_ADMIN',
  'MUNICIPAL_ADMIN',
  'SUPERVISOR',
  'OPERATOR',
  'AGENCY_MANAGER',
  'TECHNICIAN',
] as const;

export const userRoleSchema = z.enum(USER_ROLES);
export type UserRoleName = z.infer<typeof userRoleSchema>;

/** Roles allowed into each client application. */
export const CLIENT_ROLES = {
  superAdmin: ['SUPER_ADMIN'],
  municipalAdmin: ['MUNICIPAL_ADMIN', 'SUPERVISOR', 'OPERATOR', 'AGENCY_MANAGER'],
  mobile: ['TECHNICIAN', 'SUPERVISOR', 'AGENCY_MANAGER'],
} as const satisfies Record<string, readonly UserRoleName[]>;

export const authClientSchema = z.enum(['web', 'mobile']);
export type AuthClient = z.infer<typeof authClientSchema>;

export const loginRequestSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    password: z.string().min(1).max(200),
    /** `web` receives httpOnly cookies; `mobile` receives tokens in the body. */
    client: authClientSchema.default('web'),
  })
  .meta({ id: 'LoginRequest' });

export type LoginRequest = z.input<typeof loginRequestSchema>;

export const authTenantSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    code: z.string(),
    name: z.string(),
    nameHi: z.string(),
  })
  .meta({ id: 'AuthTenant' });

export const authAgencySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: z.enum(['MUNICIPAL', 'CONTRACTOR']),
  })
  .meta({ id: 'AuthAgency' });

export const authUserSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    role: userRoleSchema,
    tenant: authTenantSchema.nullable(),
    agency: authAgencySchema.nullable(),
  })
  .meta({ id: 'AuthUser' });

export type AuthUser = z.infer<typeof authUserSchema>;

export const tokenPairSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    /** Seconds until the access token expires. */
    accessTokenExpiresIn: z.number().int(),
  })
  .meta({ id: 'TokenPair' });

export type TokenPair = z.infer<typeof tokenPairSchema>;

export const loginResponseSchema = z
  .object({
    user: authUserSchema,
    /** Present only for `client: "mobile"`. */
    tokens: tokenPairSchema.optional(),
  })
  .meta({ id: 'LoginResponse' });

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const refreshRequestSchema = z
  .object({
    /** Mobile only; web clients send the httpOnly refresh cookie instead. */
    refreshToken: z.string().min(20).max(200).optional(),
  })
  .meta({ id: 'RefreshRequest' });

/** Cookie names used by the web consoles. */
export const AUTH_COOKIES = {
  accessToken: 'sl_at',
  refreshToken: 'sl_rt',
} as const;
