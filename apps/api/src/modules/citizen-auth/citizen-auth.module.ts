/**
 * Citizen sign-in with a one-time SMS code. Citizens never get passwords.
 * The session is a JWT with a citizen-only audience, delivered as an httpOnly
 * cookie scoped to the public API (or as a bearer token for future apps).
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import {
  CITIZEN_COOKIE,
  citizenSessionSchema,
  otpRequestSchema,
  otpVerifySchema,
  successEnvelope,
} from '@smart-light/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { env } from '../../config/env';
import { sendData } from '../../lib/http';
import { errorResponses, jsonContent, registry } from '../../lib/openapi';
import { prisma } from '../../lib/prisma';
import { sms } from '../../lib/sms';
import { otpRateLimit } from '../../middlewares/rate-limit';
import { AppError } from '../../utils/app-error';
import { errors } from '../../utils/errors';
import { recordAuditSafely } from '../audit/audit.service';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_PHONE_PER_15_MIN = 3;
const CITIZEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const CITIZEN_AUDIENCE = 'smart-light-citizen';
const ISSUER = 'smart-light-api';
const CITIZEN_COOKIE_PATH = '/api/v1/public';
const secretKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export interface CitizenContext {
  citizenId: string;
  phone: string;
}

function hashOtp(phone: string, code: string): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update(`${phone}:${code}`).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

// ── Service ──
export const citizenAuthService = {
  async requestOtp(phone: string, request: Request): Promise<void> {
    const recent = await prisma.otpChallenge.count({
      where: { phone, createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } },
    });
    if (recent >= OTP_MAX_PER_PHONE_PER_15_MIN) {
      throw errors.tooManyRequests('Too many codes requested. Please wait 15 minutes.');
    }
    // Configured test numbers (QA, app-store review) get their fixed code and no SMS.
    const testCode = env.OTP_TEST_NUMBERS[phone];
    const code = testCode ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
    await prisma.otpChallenge.create({
      data: {
        phone,
        purpose: 'citizen_login',
        codeHash: hashOtp(phone, code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    if (!testCode) {
      await sms.send(phone, { template: 'otp', code });
    }
    await recordAuditSafely({
      actorType: 'CITIZEN',
      action: 'citizen.otp_requested',
      metadata: { phoneSuffix: phone.slice(-2), ...(testCode ? { testNumber: true } : {}) },
      request,
    });
  },

  async verifyOtp(phone: string, code: string, request: Request) {
    const challenge = await prisma.otpChallenge.findFirst({
      where: { phone, purpose: 'citizen_login', consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) {
      throw new AppError({
        statusCode: 400,
        code: 'OTP_EXPIRED',
        message: 'The code has expired. Request a new one.',
      });
    }
    if (!safeEqualHex(challenge.codeHash, hashOtp(phone, code))) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new AppError({ statusCode: 400, code: 'INVALID_OTP', message: 'Incorrect code' });
    }

    const citizen = await prisma.$transaction(async (tx) => {
      await tx.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      return tx.citizen.upsert({
        where: { phone },
        create: { phone, lastLoginAt: new Date() },
        update: { lastLoginAt: new Date() },
      });
    });
    await recordAuditSafely({
      actorType: 'CITIZEN',
      actorId: citizen.id,
      action: 'citizen.login',
      request,
    });

    const token = await new SignJWT({ phone: citizen.phone })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(citizen.id)
      .setIssuer(ISSUER)
      .setAudience(CITIZEN_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${CITIZEN_TTL_SECONDS}s`)
      .sign(secretKey);

    return {
      token,
      session: {
        citizen: { id: citizen.id, phone: citizen.phone, name: citizen.name },
        expiresIn: CITIZEN_TTL_SECONDS,
      },
    };
  },
};

// ── Middleware ──
const citizenClaims = z.object({ sub: z.uuid(), phone: z.string() });

export async function authenticateCitizen(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.get('authorization');
  const cookie: unknown = req.cookies?.[CITIZEN_COOKIE];
  const token = header?.startsWith('Bearer ')
    ? header.slice(7).trim()
    : typeof cookie === 'string'
      ? cookie
      : '';
  if (!token) {
    throw errors.unauthenticated('Please verify your mobile number first');
  }
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: ISSUER,
      audience: CITIZEN_AUDIENCE,
      algorithms: ['HS256'],
    });
    const claims = citizenClaims.parse(payload);
    res.locals.citizen = { citizenId: claims.sub, phone: claims.phone } satisfies CitizenContext;
  } catch {
    throw errors.unauthenticated('Your session has expired. Please verify your number again.');
  }
  next();
}

export function getCitizen(res: Response): CitizenContext {
  const citizen = res.locals.citizen as CitizenContext | undefined;
  if (!citizen) {
    throw errors.unauthenticated();
  }
  return citizen;
}

// ── Routes ──
export const citizenAuthRouter = Router();

citizenAuthRouter.post('/otp/request', otpRateLimit, async (req: Request, res: Response) => {
  const { phone } = otpRequestSchema.parse(req.body);
  await citizenAuthService.requestOtp(phone, req);
  res.status(204).end();
});

citizenAuthRouter.post('/otp/verify', otpRateLimit, async (req: Request, res: Response) => {
  const { phone, code } = otpVerifySchema.parse(req.body);
  const { token, session } = await citizenAuthService.verifyOtp(phone, code, req);
  res.cookie(CITIZEN_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: CITIZEN_COOKIE_PATH,
    maxAge: CITIZEN_TTL_SECONDS * 1000,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  });
  sendData(res, session);
});

citizenAuthRouter.post('/session/logout', (_req: Request, res: Response) => {
  res.clearCookie(CITIZEN_COOKIE, { path: CITIZEN_COOKIE_PATH });
  res.status(204).end();
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/public/otp/request',
  tags: ['Citizen'],
  summary: 'Send a 6-digit verification code by SMS',
  request: { body: { content: jsonContent(otpRequestSchema) } },
  responses: { 204: { description: 'Code sent' }, ...errorResponses(400, 429) },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/public/otp/verify',
  tags: ['Citizen'],
  summary: 'Verify the code; starts a 7-day citizen session (httpOnly cookie)',
  request: { body: { content: jsonContent(otpVerifySchema) } },
  responses: {
    200: { description: 'Verified', content: jsonContent(successEnvelope(citizenSessionSchema)) },
    ...errorResponses(400, 429),
  },
});
