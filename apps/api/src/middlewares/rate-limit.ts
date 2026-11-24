import type { ApiErrorResponse } from '@smart-light/shared';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';
import { requestIdOf } from '../lib/http';

/**
 * In-memory rate limiters (one API instance). Move to a Redis store when the API
 * is scaled to multiple instances.
 */
export function createLimiter(
  windowMinutes: number,
  limit: number,
  options: { enforceInTests?: boolean } = {},
) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Off in the automated suite (hundreds of logins); rate-limit.test.ts enforces it explicitly.
    skip: () => env.NODE_ENV === 'test' && !options.enforceInTests,
    handler: (_req, res) => {
      const payload: ApiErrorResponse = {
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, please try again later' },
        meta: { timestamp: new Date().toISOString(), requestId: requestIdOf(res) },
      };
      res.status(429).json(payload);
    },
  });
}

/** Login / token endpoints: 20 attempts per 15 minutes per IP (plus account lockout). */
export const authRateLimit = createLimiter(15, 20);

/** OTP requests: 5 per 15 minutes per IP (each one sends an SMS that costs money). */
export const otpRateLimit = createLimiter(15, 5);

/** General API ceiling per IP. */
export const apiRateLimit = createLimiter(1, 300);
