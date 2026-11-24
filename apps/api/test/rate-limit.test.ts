import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { authRateLimit, createLimiter, otpRateLimit } from '../src/middlewares/rate-limit';
import { authRouter } from '../src/modules/auth/auth.routes';

describe('rate limiting', () => {
  it('answers 429 with the API error envelope and standard headers once the limit is reached', async () => {
    const app = express();
    app.post('/probe', createLimiter(15, 3, { enforceInTests: true }), (_req, res) => {
      res.status(204).end();
    });
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      statuses.push((await request(app).post('/probe')).status);
    }
    expect(statuses).toEqual([204, 204, 204, 429]);

    const blocked = await request(app).post('/probe');
    expect(blocked.body).toMatchObject({
      success: false,
      error: { code: 'TOO_MANY_REQUESTS' },
    });
    expect(blocked.headers['ratelimit-policy']).toContain('3-in-15min');
  });

  it('protects every password, code and token endpoint with the auth limiter', () => {
    type Layer = { route?: { path: string; stack: { handle: unknown }[] } };
    const stack = (authRouter as unknown as { stack: Layer[] }).stack;
    const limited = new Set(
      stack
        .filter((layer) => layer.route?.stack.some((entry) => entry.handle === authRateLimit))
        .map((layer) => layer.route?.path),
    );
    for (const path of [
      '/login',
      '/login/mfa',
      '/login/mfa/setup',
      '/refresh',
      '/change-password',
      '/mfa/setup',
      '/mfa/enable',
      '/mfa/disable',
      '/mfa/recovery-codes',
    ]) {
      expect(limited, path).toContain(path);
    }
    expect(otpRateLimit).not.toBe(authRateLimit);
  });
});
