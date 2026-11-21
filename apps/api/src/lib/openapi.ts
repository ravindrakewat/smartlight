import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { apiErrorSchema } from '@smart-light/shared';
import type { z } from 'zod';
import { env } from '../config/env';

/**
 * OpenAPI registry. Each module registers its paths in `<module>.openapi.ts`
 * using the same Zod schemas that validate requests, so the docs cannot drift.
 */
export const registry = new OpenAPIRegistry();

export const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Access token (mobile app). Web consoles use the httpOnly `sl_at` cookie.',
});

export const cookieAuth = registry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'sl_at',
});

/** Security requirement for authenticated endpoints (either scheme). */
export const AUTHENTICATED = [{ [bearerAuth.name]: [] }, { [cookieAuth.name]: [] }];

const errorContent = { 'application/json': { schema: apiErrorSchema } };

/** Standard error responses to spread into a path's `responses`. */
export function errorResponses(...statuses: (400 | 401 | 403 | 404 | 409 | 429)[]) {
  const descriptions: Record<number, string> = {
    400: 'Validation error',
    401: 'Not authenticated',
    403: 'Not allowed',
    404: 'Not found',
    409: 'Conflict',
    429: 'Too many requests',
  };
  return Object.fromEntries(
    statuses.map((status) => [
      status,
      { description: descriptions[status], content: errorContent },
    ]),
  );
}

export function jsonContent(schema: z.ZodType) {
  return { 'application/json': { schema } };
}

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Smart Street Light Management API',
      version: env.APP_VERSION,
      description:
        'Central REST API for the citizen portal, municipal and platform consoles, and the field technician app. ' +
        'All responses use the `{ success, data | error, meta }` envelope.',
    },
    servers: [{ url: '/' }],
  });
}
