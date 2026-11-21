import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, prisma } from './helpers';

describe('platform', () => {
  it('reports database readiness', async () => {
    const response = await request(app).get('/api/health/ready');
    expect(response.status).toBe(200);
    expect(response.body.data.checks).toEqual({ database: 'ok' });
  });

  it('publishes an OpenAPI document covering the auth endpoints', async () => {
    const response = await request(app).get('/api/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.0.3');
    expect(Object.keys(response.body.paths)).toEqual(
      expect.arrayContaining(['/api/v1/auth/login', '/api/v1/auth/me', '/api/health']),
    );
    expect(response.body.components.schemas.LoginRequest).toBeDefined();
  });

  it('serves the Swagger UI', async () => {
    const response = await request(app).get('/api/docs/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('swagger-ui');
  });

  it('keeps the audit log append-only', async () => {
    const entry = await prisma.auditLog.create({
      data: { actorType: 'SYSTEM', action: 'test.append_only' },
    });
    await expect(
      prisma.auditLog.update({ where: { id: entry.id }, data: { action: 'tampered' } }),
    ).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow();
  });
});
