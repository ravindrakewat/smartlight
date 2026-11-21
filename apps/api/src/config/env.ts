import dotenv from 'dotenv';
import { z } from 'zod';
import { NodeEnvironment, nodeEnvSchema, portSchema } from '@smart-light/shared';

dotenv.config();

const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema.default(NodeEnvironment.Development),
  PORT: portSchema.default(4000),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: logLevelSchema.default('info'),
  SERVICE_NAME: z.string().min(1).default('smart-light-api'),
  APP_VERSION: z.string().min(1).default('0.1.0'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001,http://localhost:3002')
    .transform((raw) =>
      raw
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

function parseEnv(): ApiEnv {
  const result = apiEnvSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid API environment configuration: ${formatted}`);
  }
  return result.data;
}

export const env: ApiEnv = parseEnv();
