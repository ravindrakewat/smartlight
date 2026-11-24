import { randomUUID } from 'node:crypto';
import { hashPassword, type UserRole } from '@smart-light/db';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { currentStep, decryptSecret, totpAt } from '../src/modules/auth/totp';

export const app = createApp();
export { prisma };

export const TEST_PASSWORD = 'Correct-Horse-9!';
export const WEB_ORIGIN = 'http://localhost:3001';

let passwordHashPromise: Promise<string> | null = null;
function testPasswordHash(): Promise<string> {
  passwordHashPromise ??= hashPassword(TEST_PASSWORD);
  return passwordHashPromise;
}

/** Short unique suffix so parallel test files never collide. */
export function uniqueSuffix(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Creates a municipality with a random 3-letter code. Only 17,576 codes exist and
 * test files run in parallel, so a clash is retried with a new code.
 */
export async function createTenant(overrides: { status?: 'ACTIVE' | 'SUSPENDED' } = {}) {
  const randomLetter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  for (let attempt = 1; ; attempt++) {
    const suffix = uniqueSuffix();
    try {
      return await prisma.tenant.create({
        data: {
          slug: `t-${suffix}`,
          code: `${randomLetter()}${randomLetter()}${randomLetter()}`,
          name: `Test City ${suffix}`,
          nameHi: `परीक्षण नगर ${suffix}`,
          status: overrides.status ?? 'ACTIVE',
        },
      });
    } catch (error) {
      const clash = (error as { code?: string }).code === 'P2002';
      if (!clash || attempt >= 20) {
        throw error;
      }
    }
  }
}

export async function createUser(options: {
  role: UserRole;
  tenantId?: string | null;
  agencyId?: string | null;
  status?: 'ACTIVE' | 'DISABLED';
}) {
  return prisma.user.create({
    data: {
      role: options.role,
      tenantId: options.tenantId ?? null,
      agencyId: options.agencyId ?? null,
      status: options.status ?? 'ACTIVE',
      name: `Test ${options.role}`,
      email: `${options.role.toLowerCase()}-${uniqueSuffix()}@test.local`,
      passwordHash: await testPasswordHash(),
    },
  });
}

/**
 * A valid authenticator code for a user: the earliest step in the accepted
 * window that was not used yet (codes are never accepted twice). If the whole
 * window is used up, waits for the next 30-second step.
 */
export async function totpCodeFor(userId: string): Promise<string> {
  for (;;) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpSecret) {
      throw new Error('User has no two-factor secret');
    }
    const secret = decryptSecret(user.totpSecret);
    const now = currentStep();
    for (const step of [now - 1, now, now + 1]) {
      if (user.totpLastStep === null || step > user.totpLastStep) {
        return totpAt(secret, step);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

/**
 * Completes a two-factor challenge the way an admin would: enrols the
 * authenticator first for a `setup` challenge, then sends a current code.
 */
export async function completeMfa(
  email: string,
  mfa: { status: 'verify' | 'setup'; challengeToken: string },
) {
  if (mfa.status === 'setup') {
    const setup = await request(app)
      .post('/api/v1/auth/login/mfa/setup')
      .send({ challengeToken: mfa.challengeToken });
    if (setup.status !== 200) {
      throw new Error(`MFA setup failed: ${setup.status} ${JSON.stringify(setup.body)}`);
    }
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return request(app)
    .post('/api/v1/auth/login/mfa')
    .send({ challengeToken: mfa.challengeToken, code: await totpCodeFor(user.id) });
}

/** Signs in as a mobile client (completing two-factor if needed) and returns the token pair. */
export async function loginMobile(email: string, password = TEST_PASSWORD) {
  let response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password, client: 'mobile' });
  if (response.status === 200 && response.body.data.mfa) {
    response = await completeMfa(email, response.body.data.mfa);
  }
  if (response.status !== 200) {
    throw new Error(`Login failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.data.tokens as { accessToken: string; refreshToken: string };
}

/** Signs in and returns a bearer header for the given user. */
export async function bearerFor(email: string): Promise<{ Authorization: string }> {
  const tokens = await loginMobile(email);
  return { Authorization: `Bearer ${tokens.accessToken}` };
}
