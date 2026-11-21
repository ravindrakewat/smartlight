import { createHash, randomBytes } from 'node:crypto';
import { userRoleSchema } from '@smart-light/shared';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { env } from '../../config/env';
import { errors } from '../../utils/errors';
import type { AuthContext } from './auth.context';

const ISSUER = 'smart-light-api';
const AUDIENCE = 'smart-light';
const secretKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

const claimsSchema = z.object({
  sub: z.uuid(),
  role: userRoleSchema,
  tid: z.uuid().nullable(),
  aid: z.uuid().nullable(),
  sid: z.uuid(),
});

/** Short-lived (default 15 min) signed access token. */
export function signAccessToken(auth: AuthContext): Promise<string> {
  return new SignJWT({
    role: auth.role,
    tid: auth.tenantId,
    aid: auth.agencyId,
    sid: auth.sessionId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(auth.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey);
}

export async function verifyAccessToken(token: string): Promise<AuthContext> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    const claims = claimsSchema.parse(payload);
    return {
      userId: claims.sub,
      role: claims.role,
      tenantId: claims.tid,
      agencyId: claims.aid,
      sessionId: claims.sid,
    };
  } catch {
    throw errors.unauthenticated('Invalid or expired access token');
  }
}

/** Opaque 256-bit refresh token; only its SHA-256 hash is stored. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
