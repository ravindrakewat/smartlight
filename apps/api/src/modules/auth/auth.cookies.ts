import { AUTH_COOKIES, type TokenPair } from '@smart-light/shared';
import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env';

/** Refresh cookie is only ever sent to the auth endpoints. */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setAuthCookies(res: Response, tokens: TokenPair): void {
  res.cookie(AUTH_COOKIES.accessToken, tokens.accessToken, {
    ...baseOptions(),
    sameSite: 'lax',
    path: '/',
    maxAge: tokens.accessTokenExpiresIn * 1000,
  });
  res.cookie(AUTH_COOKIES.refreshToken, tokens.refreshToken, {
    ...baseOptions(),
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(AUTH_COOKIES.accessToken, { ...baseOptions(), sameSite: 'lax', path: '/' });
  res.clearCookie(AUTH_COOKIES.refreshToken, {
    ...baseOptions(),
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  });
}
