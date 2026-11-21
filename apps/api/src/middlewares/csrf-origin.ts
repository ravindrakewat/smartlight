import { AUTH_COOKIES, CITIZEN_COOKIE } from '@smart-light/shared';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { errors } from '../utils/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const allowedOrigins = new Set(env.CORS_ORIGINS);

/**
 * CSRF defence for cookie-authenticated requests. Cookies are SameSite, and in
 * addition every state-changing request that relies on cookies must come from
 * one of our own web origins. Bearer-token requests (mobile) are not affected.
 */
export function csrfOriginCheck(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method) || req.get('authorization')) {
    next();
    return;
  }
  const usesCookies =
    req.cookies?.[AUTH_COOKIES.accessToken] !== undefined ||
    req.cookies?.[AUTH_COOKIES.refreshToken] !== undefined ||
    req.cookies?.[CITIZEN_COOKIE] !== undefined;
  if (!usesCookies) {
    next();
    return;
  }
  const origin = req.get('origin');
  if (!origin || !allowedOrigins.has(origin)) {
    throw errors.forbidden('Request origin is not allowed');
  }
  next();
}
