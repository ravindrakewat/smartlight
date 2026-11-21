import { z } from 'zod';
import { NodeEnvironment } from '../enums';

export const nodeEnvSchema = z.enum(NodeEnvironment);

export const httpUrlSchema = z.url({
  protocol: /^https?$/,
  error: 'Must be a valid http:// or https:// URL',
});

export const portSchema = z.coerce
  .number()
  .int({ error: 'Port must be an integer' })
  .min(1, { error: 'Port must be >= 1' })
  .max(65535, { error: 'Port must be <= 65535' });
