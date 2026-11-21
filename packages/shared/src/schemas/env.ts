import { z } from 'zod';
import { NodeEnvironment } from '../enums';

export const nodeEnvSchema = z.nativeEnum(NodeEnvironment);

export const httpUrlSchema = z
  .string()
  .url('Must be a valid URL')
  .refine(
    (value) => value.startsWith('http://') || value.startsWith('https://'),
    'URL must use http:// or https:// protocol',
  );

export const portSchema = z.coerce
  .number()
  .int('Port must be an integer')
  .min(1, 'Port must be >= 1')
  .max(65535, 'Port must be <= 65535');
