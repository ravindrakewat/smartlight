import { AUTH_COOKIES } from '@smart-light/shared';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { setAuth } from '../modules/auth/auth.context';
import { verifyAccessToken } from '../modules/auth/tokens';
import { errors } from '../utils/errors';

function readAccessToken(req: Request): string | null {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim() || null;
  }
  const cookie: unknown = req.cookies?.[AUTH_COOKIES.accessToken];
  return typeof cookie === 'string' && cookie.length > 0 ? cookie : null;
}

/**
 * Requires a valid access token (Bearer header for mobile, httpOnly cookie for web).
 * The session is also checked on every request, so logout, password resets and
 * disabled accounts take effect immediately instead of when the token expires.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readAccessToken(req);
  if (!token) {
    throw errors.unauthenticated();
  }
  const auth = await verifyAccessToken(token);

  const session = await prisma.session.findUnique({
    where: { id: auth.sessionId },
    select: {
      userId: true,
      revokedAt: true,
      expiresAt: true,
      user: { select: { status: true, tenant: { select: { status: true } } } },
    },
  });
  if (
    !session ||
    session.userId !== auth.userId ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.user.status !== 'ACTIVE' ||
    session.user.tenant?.status === 'SUSPENDED'
  ) {
    throw errors.unauthenticated('Session is no longer valid');
  }

  setAuth(res, auth);
  next();
}
