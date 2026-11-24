import type { UserRole } from '@smart-light/db';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { testOutbox } from '../src/lib/sms';
import { currentStep, decryptSecret, totpAt } from '../src/modules/auth/totp';
import {
  app,
  bearerFor,
  completeMfa,
  createTenant,
  createUser,
  loginMobile,
  prisma,
  TEST_PASSWORD,
  totpCodeFor,
  uniqueSuffix,
  WEB_ORIGIN,
} from './helpers';

type Mfa = { status: 'verify' | 'setup'; challengeToken: string; expiresAt: string };

async function passwordStep(email: string, client: 'web' | 'mobile' = 'mobile') {
  return request(app).post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD, client });
}

async function challengeFor(email: string): Promise<Mfa> {
  const response = await passwordStep(email);
  expect(response.status).toBe(200);
  expect(response.body.data.mfa).toBeDefined();
  return response.body.data.mfa as Mfa;
}

/** A super admin who has finished enrolment (first sign-in). */
async function enrolledSuperAdmin() {
  const user = await createUser({ role: 'SUPER_ADMIN' });
  const first = await completeMfa(user.email, await challengeFor(user.email));
  expect(first.status).toBe(200);
  return { user, recoveryCodes: first.body.data.recoveryCodes as string[] };
}

async function auditActions(userId: string): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    where: { OR: [{ actorId: userId }, { entityId: userId }] },
    select: { action: true },
  });
  return rows.map((row) => row.action);
}

describe('two-factor sign-in for platform administrators', () => {
  it('asks a super admin without two-factor to set it up, and gives no session yet', async () => {
    const user = await createUser({ role: 'SUPER_ADMIN' });
    const response = await passwordStep(user.email, 'web');
    expect(response.status).toBe(200);
    expect(response.body.data.mfa.status).toBe('setup');
    expect(response.body.data.user).toBeUndefined();
    expect(response.body.data.tokens).toBeUndefined();
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('enrols with a code, returns 10 recovery codes once, and stores the secret encrypted', async () => {
    const user = await createUser({ role: 'SUPER_ADMIN' });
    const mfa = await challengeFor(user.email);
    const setup = await request(app)
      .post('/api/v1/auth/login/mfa/setup')
      .send({ challengeToken: mfa.challengeToken });
    expect(setup.status).toBe(200);
    expect(setup.body.data.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    const secret = setup.body.data.secret as string;

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.totpSecret).toMatch(/^v1:/);
    expect(stored.totpSecret).not.toContain(secret);
    expect(decryptSecret(stored.totpSecret ?? '')).toBe(secret);

    const done = await request(app)
      .post('/api/v1/auth/login/mfa')
      .send({ challengeToken: mfa.challengeToken, code: totpAt(secret, currentStep()) });
    expect(done.status).toBe(200);
    expect(done.body.data.tokens.accessToken).toBeDefined();
    expect(done.body.data.recoveryCodes).toHaveLength(10);
    expect(await auditActions(user.id)).toEqual(
      expect.arrayContaining(['auth.mfa_challenge', 'auth.mfa_enabled', 'auth.login']),
    );
  });

  it('signs in on the web with a code: cookies are set only after the second step', async () => {
    const { user } = await enrolledSuperAdmin();
    const first = await passwordStep(user.email, 'web');
    expect(first.body.data.mfa.status).toBe('verify');
    expect(first.headers['set-cookie']).toBeUndefined();

    const second = await request(app)
      .post('/api/v1/auth/login/mfa')
      .send({
        challengeToken: first.body.data.mfa.challengeToken,
        code: await totpCodeFor(user.id),
      });
    expect(second.status).toBe(200);
    expect(second.body.data.tokens).toBeUndefined();
    expect(String(second.headers['set-cookie'])).toContain('sl_at=');
  });

  it('rejects a wrong code, an expired code and a replayed code', async () => {
    const { user } = await enrolledSuperAdmin();
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const secret = decryptSecret(stored.totpSecret ?? '');

    const mfa = await challengeFor(user.email);
    const wrong = await request(app)
      .post('/api/v1/auth/login/mfa')
      .send({
        challengeToken: mfa.challengeToken,
        code: '000000' === totpAt(secret, currentStep()) ? '111111' : '000000',
      });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_MFA_CODE');

    // A code from two minutes ago is outside the accepted window.
    const expired = await request(app)
      .post('/api/v1/auth/login/mfa')
      .send({ challengeToken: mfa.challengeToken, code: totpAt(secret, currentStep() - 4) });
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('INVALID_MFA_CODE');

    const code = await totpCodeFor(user.id);
    const ok = await request(app)
      .post('/api/v1/auth/login/mfa')
      .send({ challengeToken: mfa.challengeToken, code });
    expect(ok.status).toBe(200);

    // The same code on a fresh challenge is refused (replay protection).
    const again = await challengeFor(user.email);
    const replay = await request(app)
      .post('/api/v1/auth/login/mfa')
      .send({ challengeToken: again.challengeToken, code });
    expect(replay.status).toBe(401);
    expect(await auditActions(user.id)).toContain('auth.mfa_failed');
  });

  it('refuses an expired or already used challenge', async () => {
    const { user } = await enrolledSuperAdmin();
    const mfa = await challengeFor(user.email);
    await prisma.mfaChallenge.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const late = await request(app)
      .post('/api/v1/auth/login/mfa')
      .send({ challengeToken: mfa.challengeToken, code: await totpCodeFor(user.id) });
    expect(late.status).toBe(401);
    expect(late.body.error.code).toBe('MFA_CHALLENGE_INVALID');

    const fresh = await challengeFor(user.email);
    const used = await completeMfa(user.email, fresh);
    expect(used.status).toBe(200);
    const reuse = await request(app)
      .post('/api/v1/auth/login/mfa')
      .send({ challengeToken: fresh.challengeToken, code: await totpCodeFor(user.id) });
    expect(reuse.body.error.code).toBe('MFA_CHALLENGE_INVALID');

    const forged = await request(app)
      .post('/api/v1/auth/login/mfa')
      .send({ challengeToken: 'x'.repeat(43), code: '123456' });
    expect(forged.body.error.code).toBe('MFA_CHALLENGE_INVALID');
  });

  it('locks the account after 5 wrong codes, even with the right password and code', async () => {
    const { user } = await enrolledSuperAdmin();
    const mfa = await challengeFor(user.email);
    for (let attempt = 0; attempt < 5; attempt++) {
      await request(app)
        .post('/api/v1/auth/login/mfa')
        .send({ challengeToken: mfa.challengeToken, code: '000000' });
    }
    const locked = await passwordStep(user.email);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(await auditActions(user.id)).toContain('auth.account_locked');

    // The burnt challenge cannot be used either.
    const burnt = await request(app)
      .post('/api/v1/auth/login/mfa')
      .send({ challengeToken: mfa.challengeToken, code: await totpCodeFor(user.id) });
    expect(burnt.status).toBe(401);
  });

  it('accepts each recovery code once', async () => {
    const { user, recoveryCodes } = await enrolledSuperAdmin();
    const code = recoveryCodes[0] ?? '';
    const first = await request(app)
      .post('/api/v1/auth/login/mfa')
      .send({ challengeToken: (await challengeFor(user.email)).challengeToken, code });
    expect(first.status).toBe(200);
    const second = await request(app)
      .post('/api/v1/auth/login/mfa')
      .send({ challengeToken: (await challengeFor(user.email)).challengeToken, code });
    expect(second.status).toBe(401);
    expect(await auditActions(user.id)).toContain('auth.mfa_recovery_code_used');
  });

  it('cannot be turned off by a super admin (required role)', async () => {
    const { user } = await enrolledSuperAdmin();
    const auth = await bearerFor(user.email);
    const status = await request(app).get('/api/v1/auth/mfa').set(auth);
    expect(status.body.data).toMatchObject({ allowed: true, required: true, enabled: true });
    const off = await request(app)
      .post('/api/v1/auth/mfa/disable')
      .set(auth)
      .send({ password: TEST_PASSWORD, code: await totpCodeFor(user.id) });
    expect(off.status).toBe(403);
  });
});

describe('two-factor sign-in for municipal administrators (optional)', () => {
  it('can be turned on in settings, is then asked at sign-in, and turned off with password and code', async () => {
    const tenant = await createTenant();
    const admin = await createUser({ role: 'MUNICIPAL_ADMIN', tenantId: tenant.id });

    // Not required: the password alone signs in.
    const auth = await bearerFor(admin.email);
    const status = await request(app).get('/api/v1/auth/mfa').set(auth);
    expect(status.body.data).toMatchObject({ allowed: true, required: false, enabled: false });

    const setup = await request(app).post('/api/v1/auth/mfa/setup').set(auth);
    expect(setup.status).toBe(200);
    const wrong = await request(app)
      .post('/api/v1/auth/mfa/enable')
      .set(auth)
      .send({
        code: '000000' === totpAt(setup.body.data.secret, currentStep()) ? '111111' : '000000',
      });
    expect(wrong.status).toBe(401);
    const enable = await request(app)
      .post('/api/v1/auth/mfa/enable')
      .set(auth)
      .send({ code: await totpCodeFor(admin.id) });
    expect(enable.status).toBe(200);
    expect(enable.body.data.recoveryCodes).toHaveLength(10);

    expect((await challengeFor(admin.email)).status).toBe('verify');
    await loginMobile(admin.email);

    const badPassword = await request(app)
      .post('/api/v1/auth/mfa/disable')
      .set(auth)
      .send({ password: 'Wrong-password-1', code: await totpCodeFor(admin.id) });
    expect(badPassword.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    const off = await request(app)
      .post('/api/v1/auth/mfa/disable')
      .set(auth)
      .send({ password: TEST_PASSWORD, code: await totpCodeFor(admin.id) });
    expect(off.status).toBe(204);
    const plain = await passwordStep(admin.email);
    expect(plain.body.data.tokens).toBeDefined();
    expect(await auditActions(admin.id)).toEqual(
      expect.arrayContaining(['auth.mfa_enabled', 'auth.mfa_disabled']),
    );
  });

  it('is not offered to field and control-room roles', async () => {
    const tenant = await createTenant();
    const agency = await prisma.agency.create({
      data: { tenantId: tenant.id, name: `Dept ${uniqueSuffix()}`, type: 'MUNICIPAL' },
    });
    const technician = await createUser({
      role: 'TECHNICIAN',
      tenantId: tenant.id,
      agencyId: agency.id,
    });
    const auth = await bearerFor(technician.email);
    expect((await request(app).post('/api/v1/auth/mfa/setup').set(auth)).status).toBe(403);
  });
});

describe('sessions', () => {
  it('lists devices and signs out every other device', async () => {
    const tenant = await createTenant();
    const admin = await createUser({ role: 'MUNICIPAL_ADMIN', tenantId: tenant.id });
    const laptop = await bearerFor(admin.email);
    const phone = await bearerFor(admin.email);

    const list = await request(app).get('/api/v1/auth/sessions').set(laptop);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data.filter((item: { current: boolean }) => item.current)).toHaveLength(1);

    const revoke = await request(app).post('/api/v1/auth/sessions/revoke-others').set(laptop);
    expect(revoke.body.data.revoked).toBe(1);
    expect((await request(app).get('/api/v1/auth/me').set(phone)).status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me').set(laptop)).status).toBe(200);
  });

  it('ends a session at logout and after it expires', async () => {
    const tenant = await createTenant();
    const admin = await createUser({ role: 'MUNICIPAL_ADMIN', tenantId: tenant.id });
    const auth = await bearerFor(admin.email);
    await request(app).post('/api/v1/auth/logout').set(auth);
    expect((await request(app).get('/api/v1/auth/me').set(auth)).status).toBe(401);

    const other = await bearerFor(admin.email);
    await prisma.session.updateMany({
      where: { userId: admin.id, revokedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await request(app).get('/api/v1/auth/me').set(other)).status).toBe(401);
  });
});

describe('two-factor reset by a platform administrator', () => {
  it('clears the enrolment and signs the person out; nobody else may do it', async () => {
    const { user: target } = await enrolledSuperAdmin();
    const targetAuth = await bearerFor(target.email);
    const { user: platformAdmin } = await enrolledSuperAdmin();
    const tenant = await createTenant();
    const municipalAdmin = await createUser({ role: 'MUNICIPAL_ADMIN', tenantId: tenant.id });

    const denied = await request(app)
      .post(`/api/v1/users/${target.id}/mfa-reset`)
      .set(await bearerFor(municipalAdmin.email));
    expect(denied.status).toBe(403);

    const adminAuth = await bearerFor(platformAdmin.email);
    const self = await request(app)
      .post(`/api/v1/users/${platformAdmin.id}/mfa-reset`)
      .set(adminAuth);
    expect(self.status).toBe(403);

    const reset = await request(app).post(`/api/v1/users/${target.id}/mfa-reset`).set(adminAuth);
    expect(reset.status).toBe(204);
    expect((await request(app).get('/api/v1/auth/me').set(targetAuth)).status).toBe(401);
    const cleared = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(cleared).toMatchObject({ totpEnabled: false, totpSecret: null });
    // A required role must enrol again at the next sign-in.
    expect((await challengeFor(target.email)).status).toBe('setup');
    expect(await auditActions(target.id)).toContain('user.mfa_reset');
  });
});

describe('role-based access', () => {
  const ROLES: UserRole[] = [
    'SUPER_ADMIN',
    'MUNICIPAL_ADMIN',
    'SUPERVISOR',
    'OPERATOR',
    'AGENCY_MANAGER',
    'TECHNICIAN',
  ];
  const headers = new Map<string, { Authorization: string }>();
  let tenantId = '';

  beforeAll(async () => {
    const tenant = await createTenant();
    tenantId = tenant.id;
    const agency = await prisma.agency.create({
      data: { tenantId, name: `Contractor ${uniqueSuffix()}`, type: 'CONTRACTOR' },
    });
    for (const role of ROLES) {
      const user = await createUser({
        role,
        tenantId: role === 'SUPER_ADMIN' ? null : tenantId,
        agencyId: role === 'AGENCY_MANAGER' || role === 'TECHNICIAN' ? agency.id : null,
      });
      headers.set(role, await bearerFor(user.email));
    }
  });

  /** Expected status per role; anything not listed must be refused with 403. */
  const MATRIX: {
    name: string;
    method: 'get' | 'post';
    path: () => string;
    allowed: UserRole[];
  }[] = [
    {
      name: 'list municipalities',
      method: 'get',
      path: () => '/api/v1/tenants',
      allowed: ['SUPER_ADMIN'],
    },
    {
      name: 'platform audit log',
      method: 'get',
      path: () => `/api/v1/audit?tenantId=${tenantId}`,
      allowed: ['SUPER_ADMIN', 'MUNICIPAL_ADMIN'],
    },
    {
      name: 'dashboard',
      method: 'get',
      path: () => `/api/v1/dashboard/summary?tenantId=${tenantId}`,
      allowed: ['SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'SUPERVISOR', 'OPERATOR', 'AGENCY_MANAGER'],
    },
    {
      name: 'staff list',
      method: 'get',
      path: () => `/api/v1/users?tenantId=${tenantId}`,
      allowed: ['SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'SUPERVISOR', 'AGENCY_MANAGER'],
    },
    {
      name: "reset someone's two-factor",
      method: 'post',
      path: () => `/api/v1/users/${'00000000-0000-7000-8000-000000000000'}/mfa-reset`,
      allowed: ['SUPER_ADMIN'],
    },
  ];

  for (const entry of MATRIX) {
    it(`${entry.name}: only ${entry.allowed.join(', ')}`, async () => {
      for (const role of ROLES) {
        const auth = headers.get(role);
        if (!auth) throw new Error(`no session for ${role}`);
        const response = await request(app)[entry.method](entry.path()).set(auth);
        if (entry.allowed.includes(role)) {
          expect([200, 204, 404], `${role} should be allowed`).toContain(response.status);
        } else {
          expect(response.status, `${role} should be refused`).toBe(403);
        }
      }
    });
  }

  it('keeps citizens out of every staff endpoint', async () => {
    const phone = `+9197${String(Date.now()).slice(-8)}`;
    const agent = request.agent(app);
    await agent
      .post('/api/v1/public/otp/request')
      .send({ phone })
      .set('Origin', 'http://localhost:3000');
    const sms = [...testOutbox].reverse().find((message) => message.phone === phone);
    const verified = await agent
      .post('/api/v1/public/otp/verify')
      .set('Origin', 'http://localhost:3000')
      .send({ phone, code: sms?.message.slice(0, 6) ?? '' });
    expect(verified.status).toBe(200);
    for (const path of [
      '/api/v1/auth/me',
      '/api/v1/users',
      '/api/v1/work-orders',
      '/api/v1/tenants',
    ]) {
      const response = await agent.get(path).set('Origin', WEB_ORIGIN);
      expect(response.status, path).toBe(401);
    }
  });
});
