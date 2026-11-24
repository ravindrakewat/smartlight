/**
 * Two-factor sign-in (TOTP authenticator apps) for admin roles.
 *
 * Sign-in: a correct password on an account with two-factor (or whose role
 * requires it) returns a short-lived, single-use challenge instead of a session.
 * The challenge is completed with a 6-digit code or a recovery code; a `setup`
 * challenge first enrols the authenticator. Wrong codes count towards the same
 * lockout as wrong passwords.
 */
import { randomBytes } from 'node:crypto';
import { verifyPassword } from '@smart-light/db';
import {
  MFA_ROLES,
  type AuthClient,
  type MfaChallengeResponse,
  type MfaSetupResponse,
  type MfaStatus,
  type SessionInfo,
  type UserRoleName,
} from '@smart-light/shared';
import type { Request } from 'express';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/app-error';
import { errors } from '../../utils/errors';
import { recordAudit } from '../audit/audit.service';
import type { AuthContext } from './auth.context';
import { authRepository, type UserWithOrg } from './auth.repository';
import {
  assertCanSignIn,
  assertNotLocked,
  issueSession,
  recordFailure,
  type IssuedSession,
} from './auth.service';
import { hashToken } from './tokens';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  isRecoveryCode,
  otpauthUri,
  verifyTotp,
} from './totp';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** Wrong codes allowed on one challenge before it is burnt (the account lockout also applies). */
const MAX_CHALLENGE_ATTEMPTS = 5;

const invalidChallenge = () =>
  new AppError({
    statusCode: 401,
    code: 'MFA_CHALLENGE_INVALID',
    message: 'This sign-in step has expired. Sign in again.',
  });

const invalidCode = () =>
  new AppError({
    statusCode: 401,
    code: 'INVALID_MFA_CODE',
    message: 'The code is not correct or has expired.',
  });

type CodeCheck =
  | { ok: true; kind: 'totp'; step: number }
  | { ok: true; kind: 'recovery'; codeId: string }
  | { ok: false };

/** Checks a TOTP code (never the same step twice) or an unused recovery code. */
async function checkCode(
  user: { id: string; totpSecret: string | null; totpLastStep: number | null },
  code: string,
  allowRecovery: boolean,
): Promise<CodeCheck> {
  if (!user.totpSecret) {
    return { ok: false };
  }
  if (isRecoveryCode(code)) {
    if (!allowRecovery) {
      return { ok: false };
    }
    const match = await prisma.mfaRecoveryCode.findFirst({
      where: { userId: user.id, codeHash: hashRecoveryCode(code), usedAt: null },
      select: { id: true },
    });
    return match ? { ok: true, kind: 'recovery', codeId: match.id } : { ok: false };
  }
  const step = verifyTotp(decryptSecret(user.totpSecret), code, user.totpLastStep);
  return step === null ? { ok: false } : { ok: true, kind: 'totp', step };
}

/** Marks a code as spent: the TOTP step, or the recovery code. */
async function spendCode(userId: string, check: Extract<CodeCheck, { ok: true }>) {
  if (check.kind === 'totp') {
    // Only move forward: a concurrent request with the same code loses.
    const updated = await prisma.user.updateMany({
      where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: check.step } }] },
      data: { totpLastStep: check.step },
    });
    return updated.count === 1;
  }
  const updated = await prisma.mfaRecoveryCode.updateMany({
    where: { id: check.codeId, usedAt: null },
    data: { usedAt: new Date() },
  });
  return updated.count === 1;
}

async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await prisma.$transaction([
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.mfaRecoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })),
    }),
  ]);
  return codes;
}

async function startEnrolment(user: { id: string; email: string; totpEnabled: boolean }) {
  if (user.totpEnabled) {
    throw errors.conflict('MFA_ALREADY_ENABLED', 'Two-factor sign-in is already on');
  }
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: encryptSecret(secret), totpLastStep: null },
  });
  return { secret, otpauthUri: otpauthUri(secret, user.email) };
}

async function loadChallenge(token: string) {
  const challenge = await prisma.mfaChallenge.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (
    !challenge ||
    challenge.consumedAt ||
    challenge.expiresAt <= new Date() ||
    challenge.attempts >= MAX_CHALLENGE_ATTEMPTS
  ) {
    throw invalidChallenge();
  }
  const user = await authRepository.findUserById(challenge.userId);
  if (!user) {
    throw invalidChallenge();
  }
  return { challenge, user };
}

export const mfaService = {
  isAllowed(role: UserRoleName): boolean {
    return (MFA_ROLES as readonly string[]).includes(role);
  },

  isRequired(role: UserRoleName): boolean {
    return env.MFA_REQUIRED_ROLES.includes(role);
  },

  /** Issued after a correct password; any earlier open challenge of the user is closed. */
  async createChallenge(
    user: UserWithOrg,
    purpose: 'verify' | 'setup',
    client: AuthClient,
    request: Request,
  ): Promise<MfaChallengeResponse> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await prisma.$transaction([
      prisma.mfaChallenge.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      prisma.mfaChallenge.create({
        data: { userId: user.id, tokenHash: hashToken(token), purpose, client, expiresAt },
      }),
    ]);
    await recordAudit({
      tenantId: user.tenantId,
      actorType: 'USER',
      actorId: user.id,
      action: 'auth.mfa_challenge',
      metadata: { purpose, client },
      request,
    });
    return { mfa: { status: purpose, challengeToken: token, expiresAt: expiresAt.toISOString() } };
  },

  /** Enrolment during sign-in, from a `setup` challenge. */
  async setupFromChallenge(token: string): Promise<MfaSetupResponse> {
    const { challenge, user } = await loadChallenge(token);
    if (challenge.purpose !== 'setup') {
      throw invalidChallenge();
    }
    return startEnrolment(user);
  },

  /** The second sign-in step. Returns the session, plus recovery codes if enrolment finished. */
  async completeLogin(
    token: string,
    code: string,
    request: Request,
  ): Promise<{ issued: IssuedSession; client: AuthClient; recoveryCodes?: string[] }> {
    const { challenge, user } = await loadChallenge(token);
    assertNotLocked(user);
    assertCanSignIn(user);

    const enrolling = challenge.purpose === 'setup';
    if (enrolling && user.totpEnabled) {
      throw invalidChallenge();
    }
    const check = await checkCode(user, code, !enrolling);
    if (!check.ok || !(await spendCode(user.id, check))) {
      await prisma.mfaChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      await recordFailure(user, 'auth.mfa_failed', request);
      throw invalidCode();
    }

    const consumed = await prisma.mfaChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw invalidChallenge();
    }

    let recoveryCodes: string[] | undefined;
    if (enrolling) {
      await prisma.user.update({
        where: { id: user.id },
        data: { totpEnabled: true, totpEnabledAt: new Date() },
      });
      recoveryCodes = await replaceRecoveryCodes(user.id);
    }
    await authRepository.recordSuccessfulLogin(user.id);
    const client: AuthClient = challenge.client === 'mobile' ? 'mobile' : 'web';
    const issued = await issueSession(user, client, request);
    const audit = {
      tenantId: user.tenantId,
      actorType: 'USER' as const,
      actorId: user.id,
      request,
    };
    if (enrolling) {
      await recordAudit({ ...audit, action: 'auth.mfa_enabled', metadata: { during: 'sign-in' } });
    }
    if (check.kind === 'recovery') {
      const left = await prisma.mfaRecoveryCode.count({ where: { userId: user.id, usedAt: null } });
      await recordAudit({ ...audit, action: 'auth.mfa_recovery_code_used', metadata: { left } });
    }
    await recordAudit({
      ...audit,
      action: 'auth.login',
      metadata: { client: challenge.client, mfa: check.kind },
    });
    return { issued, client, ...(recoveryCodes ? { recoveryCodes } : {}) };
  },

  async status(auth: AuthContext): Promise<MfaStatus> {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { totpEnabled: true, totpEnabledAt: true },
    });
    if (!user) {
      throw errors.unauthenticated();
    }
    return {
      allowed: mfaService.isAllowed(auth.role),
      required: mfaService.isRequired(auth.role),
      enabled: user.totpEnabled,
      enabledAt: user.totpEnabledAt?.toISOString() ?? null,
      recoveryCodesLeft: user.totpEnabled
        ? await prisma.mfaRecoveryCode.count({ where: { userId: auth.userId, usedAt: null } })
        : 0,
    };
  },

  /** Signed-in enrolment, step 1: a new secret (replaces an unfinished one). */
  async setupSignedIn(auth: AuthContext): Promise<MfaSetupResponse> {
    if (!mfaService.isAllowed(auth.role)) {
      throw errors.forbidden('Two-factor sign-in is not available for this role');
    }
    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user) {
      throw errors.unauthenticated();
    }
    return startEnrolment(user);
  },

  /** Signed-in enrolment, step 2: confirm with a code; returns the recovery codes once. */
  async enable(auth: AuthContext, code: string, request: Request): Promise<string[]> {
    if (!mfaService.isAllowed(auth.role)) {
      throw errors.forbidden('Two-factor sign-in is not available for this role');
    }
    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user?.totpSecret || user.totpEnabled) {
      throw errors.conflict('MFA_NOT_PENDING', 'Start two-factor setup first');
    }
    const check = await checkCode(user, code, false);
    if (!check.ok || !(await spendCode(user.id, check))) {
      throw invalidCode();
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: true, totpEnabledAt: new Date() },
    });
    const codes = await replaceRecoveryCodes(user.id);
    await recordAudit({
      tenantId: auth.tenantId,
      actorType: 'USER',
      actorId: auth.userId,
      action: 'auth.mfa_enabled',
      metadata: { during: 'settings' },
      request,
    });
    return codes;
  },

  /** Needs the password and a current code; not possible where the role requires two-factor. */
  async disable(auth: AuthContext, password: string, code: string, request: Request) {
    if (mfaService.isRequired(auth.role)) {
      throw errors.forbidden('Two-factor sign-in is required for this role');
    }
    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user?.totpEnabled) {
      throw errors.conflict('MFA_NOT_ENABLED', 'Two-factor sign-in is not on');
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw errors.badRequest('INVALID_CURRENT_PASSWORD', 'The password is not correct');
    }
    const check = await checkCode(user, code, true);
    if (!check.ok || !(await spendCode(user.id, check))) {
      throw invalidCode();
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { totpEnabled: false, totpEnabledAt: null, totpSecret: null, totpLastStep: null },
      }),
      prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
    ]);
    await recordAudit({
      tenantId: auth.tenantId,
      actorType: 'USER',
      actorId: auth.userId,
      action: 'auth.mfa_disabled',
      request,
    });
  },

  /** New set of recovery codes (the old ones stop working); needs a current code. */
  async regenerateRecoveryCodes(auth: AuthContext, code: string, request: Request) {
    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user?.totpEnabled) {
      throw errors.conflict('MFA_NOT_ENABLED', 'Two-factor sign-in is not on');
    }
    const check = await checkCode(user, code, false);
    if (!check.ok || !(await spendCode(user.id, check))) {
      throw invalidCode();
    }
    const codes = await replaceRecoveryCodes(user.id);
    await recordAudit({
      tenantId: auth.tenantId,
      actorType: 'USER',
      actorId: auth.userId,
      action: 'auth.mfa_recovery_codes_regenerated',
      request,
    });
    return codes;
  },

  /**
   * A platform administrator clears another person's two-factor sign-in (lost
   * phone and codes). Their sessions end; a required role enrols again at the
   * next sign-in.
   */
  async adminReset(targetId: string, auth: AuthContext, request: Request): Promise<void> {
    if (auth.role !== 'SUPER_ADMIN') {
      throw errors.forbidden();
    }
    if (targetId === auth.userId) {
      throw errors.forbidden('Use your recovery codes for your own account');
    }
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      throw errors.notFound('User');
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: targetId },
        data: { totpEnabled: false, totpEnabledAt: null, totpSecret: null, totpLastStep: null },
      }),
      prisma.mfaRecoveryCode.deleteMany({ where: { userId: targetId } }),
      prisma.mfaChallenge.updateMany({
        where: { userId: targetId, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      prisma.session.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await recordAudit({
      tenantId: target.tenantId,
      actorType: 'USER',
      actorId: auth.userId,
      action: 'user.mfa_reset',
      entityType: 'user',
      entityId: targetId,
      request,
    });
  },

  // ─── Signed-in devices ─────────────────────────────────────────────────────

  async sessions(auth: AuthContext): Promise<SessionInfo[]> {
    const rows = await prisma.session.findMany({
      where: {
        userId: auth.userId,
        revokedAt: null,
        rotatedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    const current = await prisma.session.findUnique({
      where: { id: auth.sessionId },
      select: { familyId: true },
    });
    return rows.map((row) => ({
      id: row.id,
      client: row.client,
      userAgent: row.userAgent,
      ip: row.ip,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      current: row.familyId === current?.familyId,
    }));
  },

  /** Signs out every other device; this one stays signed in. */
  async revokeOtherSessions(auth: AuthContext, request: Request): Promise<number> {
    const current = await prisma.session.findUnique({
      where: { id: auth.sessionId },
      select: { familyId: true },
    });
    const result = await prisma.session.updateMany({
      where: {
        userId: auth.userId,
        revokedAt: null,
        ...(current ? { NOT: { familyId: current.familyId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    await recordAudit({
      tenantId: auth.tenantId,
      actorType: 'USER',
      actorId: auth.userId,
      action: 'auth.sessions_revoked',
      metadata: { count: result.count },
      request,
    });
    return result.count;
  },
};
