import type { UserRoleName } from '@smart-light/shared';
import type { Response } from 'express';
import { errors } from '../../utils/errors';

/** The authenticated staff member making the request. */
export interface AuthContext {
  userId: string;
  role: UserRoleName;
  /** Null only for SUPER_ADMIN. */
  tenantId: string | null;
  agencyId: string | null;
  sessionId: string;
}

export function setAuth(res: Response, auth: AuthContext): void {
  res.locals.auth = auth;
}

/** Returns the authenticated user; use only behind the `authenticate` middleware. */
export function getAuth(res: Response): AuthContext {
  const auth = res.locals.auth as AuthContext | undefined;
  if (!auth) {
    throw errors.unauthenticated();
  }
  return auth;
}

/**
 * Tenant the actor works in. Tenant staff are always pinned to their own tenant;
 * a SUPER_ADMIN must name the tenant explicitly.
 */
export function requireTenantId(auth: AuthContext, requestedTenantId?: string): string {
  if (auth.tenantId) {
    if (requestedTenantId && requestedTenantId !== auth.tenantId) {
      throw errors.forbidden('Cross-tenant access is not allowed');
    }
    return auth.tenantId;
  }
  if (auth.role === 'SUPER_ADMIN' && requestedTenantId) {
    return requestedTenantId;
  }
  throw errors.badRequest('TENANT_REQUIRED', 'A tenantId is required for this request');
}
