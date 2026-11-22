import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  app,
  createTenant,
  createUser,
  loginMobile,
  prisma,
  TEST_PASSWORD,
  WEB_ORIGIN,
} from './helpers';

function cookiesOf(response: request.Response): string[] {
  const header = response.headers['set-cookie'] as unknown;
  return Array.isArray(header) ? (header as string[]) : [];
}

describe('auth', () => {
  let tenantId: string;

  beforeAll(async () => {
    tenantId = (await createTenant()).id;
  });

  describe('POST /api/v1/auth/login', () => {
    it('signs a web user in with httpOnly cookies and no tokens in the body', async () => {
      const user = await createUser({ role: 'MUNICIPAL_ADMIN', tenantId });
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email.toUpperCase(), password: TEST_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.data.user).toMatchObject({ id: user.id, role: 'MUNICIPAL_ADMIN' });
      expect(response.body.data.user.tenant.id).toBe(tenantId);
      expect(response.body.data.tokens).toBeUndefined();

      const cookies = cookiesOf(response);
      const access = cookies.find((cookie) => cookie.startsWith('sl_at='));
      const refresh = cookies.find((cookie) => cookie.startsWith('sl_rt='));
      expect(access).toContain('HttpOnly');
      expect(refresh).toContain('HttpOnly');
      expect(refresh).toContain('Path=/api/v1/auth');
      expect(refresh).toContain('SameSite=Strict');
    });

    it('returns a token pair to the mobile app', async () => {
      const user = await createUser({ role: 'TECHNICIAN', tenantId });
      const tokens = await loginMobile(user.email);
      expect(tokens.accessToken.split('.')).toHaveLength(3);
      expect(tokens.refreshToken.length).toBeGreaterThan(30);
    });

    it('gives the same error for a wrong password and an unknown e-mail', async () => {
      const user = await createUser({ role: 'OPERATOR', tenantId });
      const wrongPassword = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'nope' });
      const unknownEmail = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@test.local', password: 'nope' });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.error).toEqual(unknownEmail.body.error);
    });

    it('locks the account after 5 failed attempts, even for the right password', async () => {
      const user = await createUser({ role: 'SUPERVISOR', tenantId });
      for (let attempt = 0; attempt < 5; attempt++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email: user.email, password: 'wrong' });
      }
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD });

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('ACCOUNT_LOCKED');
      const audit = await prisma.auditLog.findFirst({
        where: { actorId: user.id, action: 'auth.account_locked' },
      });
      expect(audit).not.toBeNull();
    });

    it('rejects disabled accounts and suspended municipalities', async () => {
      const disabled = await createUser({ role: 'OPERATOR', tenantId, status: 'DISABLED' });
      const suspendedTenant = await createTenant({ status: 'SUSPENDED' });
      const suspendedUser = await createUser({
        role: 'MUNICIPAL_ADMIN',
        tenantId: suspendedTenant.id,
      });

      const first = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: disabled.email, password: TEST_PASSWORD });
      const second = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: suspendedUser.email, password: TEST_PASSWORD });

      expect(first.body.error.code).toBe('ACCOUNT_DISABLED');
      expect(second.body.error.code).toBe('TENANT_SUSPENDED');
    });

    it('validates the request body', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: '' });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('records a successful login in the audit log', async () => {
      const user = await createUser({ role: 'MUNICIPAL_ADMIN', tenantId });
      await loginMobile(user.email);
      const audit = await prisma.auditLog.findFirst({
        where: { actorId: user.id, action: 'auth.login' },
      });
      expect(audit?.tenantId).toBe(tenantId);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('works with a bearer token and with the web cookie', async () => {
      const user = await createUser({ role: 'MUNICIPAL_ADMIN', tenantId });
      const tokens = await loginMobile(user.email);
      const viaBearer = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`);
      expect(viaBearer.status).toBe(200);
      expect(viaBearer.body.data.email).toBe(user.email);

      const agent = request.agent(app);
      await agent.post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD });
      const viaCookie = await agent.get('/api/v1/auth/me');
      expect(viaCookie.status).toBe(200);
    });

    it('rejects missing and forged tokens', async () => {
      expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);

      const forged = await new SignJWT({
        role: 'SUPER_ADMIN',
        tid: null,
        aid: null,
        sid: crypto.randomUUID(),
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(crypto.randomUUID())
        .setIssuer('smart-light-api')
        .setAudience('smart-light')
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode('an-attacker-guessed-secret-that-is-long-enough'));
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${forged}`);
      expect(response.status).toBe(401);
    });
  });

  describe('refresh token rotation', () => {
    it('rotates tokens and revokes the whole session family on reuse', async () => {
      const user = await createUser({ role: 'TECHNICIAN', tenantId });
      const first = await loginMobile(user.email);

      const rotated = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first.refreshToken });
      expect(rotated.status).toBe(200);
      const second = rotated.body.data.tokens as { accessToken: string; refreshToken: string };
      expect(second.refreshToken).not.toBe(first.refreshToken);

      // Replaying the old token = theft signal.
      const replay = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first.refreshToken });
      expect(replay.status).toBe(401);

      // The legitimate new session is revoked as well.
      const afterReuse = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${second.accessToken}`);
      expect(afterReuse.status).toBe(401);
      const refreshAgain = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: second.refreshToken });
      expect(refreshAgain.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('revokes the session immediately', async () => {
      const user = await createUser({ role: 'TECHNICIAN', tenantId });
      const tokens = await loginMobile(user.email);
      const auth = { Authorization: `Bearer ${tokens.accessToken}` };

      expect((await request(app).post('/api/v1/auth/logout').set(auth)).status).toBe(204);
      expect((await request(app).get('/api/v1/auth/me').set(auth)).status).toBe(401);
    });

    it('requires an allowed Origin for cookie-authenticated requests (CSRF)', async () => {
      const user = await createUser({ role: 'MUNICIPAL_ADMIN', tenantId });
      const agent = request.agent(app);
      await agent.post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD });

      const forged = await agent.post('/api/v1/auth/logout').set('Origin', 'https://evil.example');
      expect(forged.status).toBe(403);

      const legitimate = await agent.post('/api/v1/auth/logout').set('Origin', WEB_ORIGIN);
      expect(legitimate.status).toBe(204);
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    it('changes the password, keeps this device and signs out the others', async () => {
      const user = await createUser({ role: 'SUPERVISOR', tenantId });
      const phone = await loginMobile(user.email);
      const laptop = await loginMobile(user.email);
      const auth = { Authorization: `Bearer ${phone.accessToken}` };

      const wrong = await request(app)
        .post('/api/v1/auth/change-password')
        .set(auth)
        .send({ currentPassword: 'not-it', newPassword: 'Brand-New-2026' });
      expect(wrong.body.error.code).toBe('INVALID_CURRENT_PASSWORD');

      const same = await request(app)
        .post('/api/v1/auth/change-password')
        .set(auth)
        .send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD });
      expect(same.body.error.code).toBe('VALIDATION_ERROR');

      const changed = await request(app)
        .post('/api/v1/auth/change-password')
        .set(auth)
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'Brand-New-2026' });
      expect(changed.status).toBe(204);

      expect((await request(app).get('/api/v1/auth/me').set(auth)).status).toBe(200);
      const other = { Authorization: `Bearer ${laptop.accessToken}` };
      expect((await request(app).get('/api/v1/auth/me').set(other)).status).toBe(401);

      const oldLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD, client: 'mobile' });
      expect(oldLogin.status).toBe(401);
      expect((await loginMobile(user.email, 'Brand-New-2026')).accessToken).toBeTruthy();
    });

    it('requires sign-in', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: 'x', newPassword: 'Brand-New-2026' });
      expect(response.status).toBe(401);
    });
  });
});
