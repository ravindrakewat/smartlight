import { z } from 'zod';
import { NodeEnvironment } from '../enums';

export const nodeEnvSchema = z.enum(NodeEnvironment);

export const httpUrlSchema = z.url({
  protocol: /^https?$/,
  error: 'Must be a valid http:// or https:// URL',
});

/**
 * API base for web apps: an absolute URL (local dev), or a same-origin path such
 * as `/api` when the web app forwards API calls (production on Vercel).
 */
export const apiBaseUrlSchema = z.union([
  httpUrlSchema,
  z.string().regex(/^\/[A-Za-z0-9/_-]*$/, { error: 'Must be a URL or a path such as /api' }),
]);

export const portSchema = z.coerce
  .number()
  .int({ error: 'Port must be an integer' })
  .min(1, { error: 'Port must be >= 1' })
  .max(65535, { error: 'Port must be <= 65535' });
