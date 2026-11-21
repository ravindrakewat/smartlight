import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from '@smart-light/db';
import type { AuthClient, AuthUser, TokenPair } from '@smart-light/shared';
import type { Request } from 'express';
import { env } from '../../config/env';
import { clientInfo } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/app-error';
import { errors } from '../../utils/errors';
import { recordAudit, recordAuditSafely } from '../audit/audit.service';
import type { AuthContext } from './auth.context';
import { authRepository, type UserWithOrg } from './auth.repository';
import { generateRefreshToken, hashToken, signAccessToken } from './tokens';

/** After this many consecutive failures the account is locked for LOCK_MINUTES. */
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

/** Hash used to spend the same time when the e-mail does not exist (no user enumeration). */
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('timing-equaliser-not-a-real-password');
  return dummyHashPromise;
}

export function toAuthUser(user: UserWithOrg): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tenant: user.tenant
      ? {
          id: user.tenant.id,
          slug: user.tenant.slug,
          code: user.tenant.code,
          name: user.tenant.name,
          nameHi: user.tenant.nameHi,
        }
      : null,
    agency: user.agency
      ? { id: user.agency.id, name: user.agency.name, type: user.agency.type }
      : null,
  };
}

export interface IssuedSession {
  user: AuthUser;
  tokens: TokenPair;
}

function assertCanSignIn(user: UserWithOrg): void {
  if (user.status !== 'ACTIVE') {
    throw new AppError({
      statusCode: 403,
      code: 'ACCOUNT_DISABLED',
      message: 'This account has been disabled. Contact your administrator.',
    });
  }
  if (user.tenant?.status === 'SUSPENDED') {
    throw new AppError({
      statusCode: 403,
      code: 'TENANT_SUSPENDED',
      message: 'This municipality is suspended on the platform.',
    });
  }
}

async function issueSession(
  user: UserWithOrg,
  client: AuthClient,
  request: Request,
  familyId: string = randomUUID(),
): Promise<IssuedSession> {
  const refreshToken = generateRefreshToken();
  const { ip, userAgent } = clientInfo(request);
  const session = await authRepository.createSession({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    familyId,
    client,
    ip,
    userAgent,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  });

  const auth: AuthContext = {
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId,
    agencyId: user.agencyId,
    sessionId: session.id,
  };
  return {
    user: toAuthUser(user),
    tokens: {
      accessToken: await signAccessToken(auth),
      refreshToken,
      accessTokenExpiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    },
  };
}

export const authService = {
  async login(
    input: { email: string; password: string; client: AuthClient },
    request: Request,
  ): Promise<IssuedSession> {
    const user = await authRepository.findUserByEmail(input.email);
    if (!user) {
      await verifyPassword(await dummyHash(), input.password);
      await recordAuditSafely({
        actorType: 'USER',
        action: 'auth.login_failed',
        metadata: { reason: 'unknown_email' },
        request,
      });
      throw errors.invalidCredentials();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError({
        statusCode: 429,
        code: 'ACCOUNT_LOCKED',
        message: `Too many failed attempts. Try again after ${LOCK_MINUTES} minutes.`,
      });
    }

    if (!(await verifyPassword(user.passwordHash, input.password))) {
      const failures = user.failedLoginCount + 1;
      const lockUntil =
        failures >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null;
      await authRepository.recordFailedLogin(user.id, lockUntil);
      await recordAuditSafely({
        tenantId: user.tenantId,
        actorType: 'USER',
        actorId: user.id,
        action: lockUntil ? 'auth.account_locked' : 'auth.login_failed',
        metadata: { failures },
        request,
      });
      throw errors.invalidCredentials();
    }

    assertCanSignIn(user);
    await authRepository.recordSuccessfulLogin(user.id);
    const issued = await issueSession(user, input.client, request);
    await recordAudit({
      tenantId: user.tenantId,
      actorType: 'USER',
      actorId: user.id,
      action: 'auth.login',
      metadata: { client: input.client },
      request,
    });
    return issued;
  },

  /**
   * Rotates a refresh token. Presenting an already-rotated token means it was
   * stolen or replayed: the whole session family is revoked.
   */
  async refresh(refreshToken: string, request: Request): Promise<IssuedSession> {
    const session = await authRepository.findSessionByTokenHash(hashToken(refreshToken));
    if (!session) {
      throw errors.unauthenticated('Invalid refresh token');
    }
    if (session.rotatedAt || session.revokedAt) {
      if (session.rotatedAt) {
        await authRepository.revokeFamily(session.familyId);
        await recordAuditSafely({
          tenantId: session.user.tenantId,
          actorType: 'USER',
          actorId: session.userId,
          action: 'auth.refresh_token_reuse',
          metadata: { familyId: session.familyId },
          request,
        });
      }
      throw errors.unauthenticated('Refresh token is no longer valid');
    }
    if (session.expiresAt <= new Date()) {
      throw errors.unauthenticated('Session expired');
    }
    assertCanSignIn(session.user);

    const rotated = await prisma.$transaction((tx) => authRepository.markRotated(session.id, tx));
    if (!rotated) {
      throw errors.unauthenticated('Refresh token is no longer valid');
    }
    return issueSession(
      session.user,
      session.client === 'mobile' ? 'mobile' : 'web',
      request,
      session.familyId,
    );
  },

  async logout(auth: AuthContext, request: Request): Promise<void> {
    await authRepository.revokeSession(auth.sessionId);
    await recordAudit({
      tenantId: auth.tenantId,
      actorType: 'USER',
      actorId: auth.userId,
      action: 'auth.logout',
      request,
    });
  },

  async me(auth: AuthContext): Promise<AuthUser> {
    const user = await authRepository.findUserById(auth.userId);
    if (!user) {
      throw errors.unauthenticated();
    }
    return toAuthUser(user);
  },
};
