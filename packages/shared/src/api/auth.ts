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

// ─── Two-factor sign-in (TOTP) ───────────────────────────────────────────────

/** Roles that may turn on two-factor sign-in (web console roles with admin power). */
export const MFA_ROLES = [
  'SUPER_ADMIN',
  'MUNICIPAL_ADMIN',
] as const satisfies readonly UserRoleName[];

/**
 * After a correct password, an account with two-factor sign-in gets a challenge
 * instead of a session: `verify` = enter a code, `setup` = the role requires
 * two-factor sign-in and it is not set up yet.
 */
export const mfaChallengeResponseSchema = z
  .object({
    mfa: z.object({
      status: z.enum(['verify', 'setup']),
      /** Opaque, single use, valid for a few minutes. */
      challengeToken: z.string(),
      expiresAt: z.iso.datetime(),
    }),
  })
  .meta({ id: 'MfaChallengeResponse' });

export type MfaChallengeResponse = z.infer<typeof mfaChallengeResponseSchema>;

/** What POST /auth/login answers: a session, or a second-step challenge. */
export type LoginResult = LoginResponse | MfaChallengeResponse;

export function isMfaChallenge(result: LoginResult): result is MfaChallengeResponse {
  return 'mfa' in result;
}

/** A 6-digit authenticator code or a recovery code (`xxxx-xxxx`); spaces are ignored. */
export const mfaCodeSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, '').toLowerCase())
  .pipe(
    z.string().regex(/^(\d{6}|[a-z2-7]{4}-?[a-z2-7]{4})$/, { error: 'Enter the 6-digit code' }),
  );

export const mfaVerifyRequestSchema = z
  .object({ challengeToken: z.string().min(20).max(200), code: mfaCodeSchema })
  .meta({ id: 'MfaVerifyRequest' });

/** Starting enrolment: from a `setup` challenge during sign-in, or signed in (no token). */
export const mfaSetupRequestSchema = z
  .object({ challengeToken: z.string().min(20).max(200).optional() })
  .meta({ id: 'MfaSetupRequest' });

export const mfaSetupResponseSchema = z
  .object({
    /** Base32 secret for typing into an authenticator app by hand. */
    secret: z.string(),
    /** `otpauth://` URI to show as a QR code. */
    otpauthUri: z.string(),
  })
  .meta({ id: 'MfaSetupResponse' });

export type MfaSetupResponse = z.infer<typeof mfaSetupResponseSchema>;

/** Session after the second step; `recoveryCodes` only when two-factor was just turned on. */
export const mfaLoginResponseSchema = loginResponseSchema
  .extend({ recoveryCodes: z.array(z.string()).optional() })
  .meta({ id: 'MfaLoginResponse' });

export type MfaLoginResponse = z.infer<typeof mfaLoginResponseSchema>;

export const mfaEnableRequestSchema = z
  .object({ code: mfaCodeSchema })
  .meta({ id: 'MfaEnableRequest' });

export const mfaRecoveryCodesResponseSchema = z
  .object({ recoveryCodes: z.array(z.string()) })
  .meta({ id: 'MfaRecoveryCodesResponse' });

export const mfaDisableRequestSchema = z
  .object({ password: z.string().min(1).max(200), code: mfaCodeSchema })
  .meta({ id: 'MfaDisableRequest' });

export const mfaStatusSchema = z
  .object({
    /** This role may use two-factor sign-in. */
    allowed: z.boolean(),
    /** This role must use it (cannot be turned off). */
    required: z.boolean(),
    enabled: z.boolean(),
    enabledAt: z.iso.datetime().nullable(),
    recoveryCodesLeft: z.number().int(),
  })
  .meta({ id: 'MfaStatus' });

export type MfaStatus = z.infer<typeof mfaStatusSchema>;

// ─── Sessions (signed-in devices) ────────────────────────────────────────────

export const sessionInfoSchema = z
  .object({
    id: z.uuid(),
    client: z.string(),
    userAgent: z.string().nullable(),
    ip: z.string().nullable(),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    /** The session making this request. */
    current: z.boolean(),
  })
  .meta({ id: 'SessionInfo' });

export type SessionInfo = z.infer<typeof sessionInfoSchema>;

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
