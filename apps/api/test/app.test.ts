import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

const app = createApp();

describe('GET /api/health', () => {
  it('returns the health envelope with a request id', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('ok');
    expect(response.headers['x-request-id']).toBe(response.body.meta.requestId);
  });
});

describe('error handling', () => {
  it('returns 404 ROUTE_NOT_FOUND for unknown routes', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('returns 400 INVALID_JSON with a request id for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('content-type', 'application/json')
      .send('{bad');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
    expect(typeof response.body.meta.requestId).toBe('string');
  });

  it('returns 413 PAYLOAD_TOO_LARGE for bodies over the limit', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ blob: 'a'.repeat(1_200_000) }));

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('request id', () => {
  it('echoes a safe client-supplied request id', async () => {
    const response = await request(app).get('/api/health').set('x-request-id', 'client-abc_123');

    expect(response.headers['x-request-id']).toBe('client-abc_123');
  });

  it('replaces an unsafe client-supplied request id', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('x-request-id', 'bad id\twith spaces');

    expect(response.headers['x-request-id']).not.toBe('bad id\twith spaces');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
