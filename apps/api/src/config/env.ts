import dotenv from 'dotenv';
import { z } from 'zod';
import { NodeEnvironment, nodeEnvSchema, portSchema } from '@smart-light/shared';

dotenv.config({ quiet: true });

const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

const apiEnvSchema = z
  .object({
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

    DATABASE_URL: z.string().min(1, { error: 'DATABASE_URL is required' }),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),

    /** HS256 signing key for access tokens. Generate with: openssl rand -base64 48 */
    JWT_ACCESS_SECRET: z.string().min(32, { error: 'JWT_ACCESS_SECRET must be ≥ 32 characters' }),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

    /**
     * Parent domain shared by the API and the web consoles in production
     * (e.g. `.smartlight.example.in`) so auth cookies are first-party. Empty locally.
     */
    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SECURE: z.stringbool().optional(),

    API_DOCS_ENABLED: z.stringbool().optional(),

    /** `console` logs SMS locally; `msg91` delivers through MSG91 (DLT templates). */
    SMS_PROVIDER: z.enum(['console', 'msg91']).default('console'),
    MSG91_AUTH_KEY: z.string().min(1).optional(),
    /** MSG91 Flow template IDs, each linked to a DLT-approved template. */
    MSG91_TEMPLATE_OTP: z.string().min(1).optional(),
    MSG91_TEMPLATE_COMPLAINT_RESOLVED: z.string().min(1).optional(),

    /**
     * Test phone numbers with a fixed OTP and no SMS, e.g.
     * `+919000000001:246810,+919000000002:135790`. For QA and app-store review
     * only; every other number gets a random code by SMS. Empty = off.
     */
    OTP_TEST_NUMBERS: z
      .string()
      .default('')
      .transform((raw, context) => {
        const numbers: Record<string, string> = {};
        for (const entry of raw
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)) {
          const match = /^(\+91\d{10}):(\d{6})$/.exec(entry);
          if (!match?.[1] || !match[2]) {
            context.addIssue({
              code: 'custom',
              message: 'Each entry must look like +91XXXXXXXXXX:123456',
            });
            return z.NEVER;
          }
          numbers[match[1]] = match[2];
        }
        return numbers;
      }),

    /**
     * MQTT broker for the IoT worker (src/worker.ts), e.g. mqtts://broker.example.in:8883.
     * The HTTP API does not use it: commands go through the database outbox.
     */
    MQTT_URL: z
      .string()
      .regex(/^mqtts?:\/\/.+/, { error: 'Use mqtts://host:8883 (or mqtt:// locally)' })
      .optional(),
    MQTT_USERNAME: z.string().min(1).optional(),
    MQTT_PASSWORD: z.string().min(1).optional(),
    /** Fixed id so the broker keeps the worker's session across restarts. */
    MQTT_CLIENT_ID: z.string().min(1).default('sl-backend-worker'),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === NodeEnvironment.Production && value.MQTT_URL?.startsWith('mqtt://')) {
      context.addIssue({
        code: 'custom',
        path: ['MQTT_URL'],
        message: 'Production must use TLS (mqtts://)',
      });
    }
    if (value.SMS_PROVIDER !== 'msg91') {
      return;
    }
    for (const key of [
      'MSG91_AUTH_KEY',
      'MSG91_TEMPLATE_OTP',
      'MSG91_TEMPLATE_COMPLAINT_RESOLVED',
    ] as const) {
      if (!value[key]) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when SMS_PROVIDER=msg91`,
        });
      }
    }
  });

export type ApiEnv = Omit<z.infer<typeof apiEnvSchema>, 'COOKIE_SECURE' | 'API_DOCS_ENABLED'> & {
  COOKIE_SECURE: boolean;
  API_DOCS_ENABLED: boolean;
};

function parseEnv(): ApiEnv {
  const result = apiEnvSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid API environment configuration: ${formatted}`);
  }

  const isProduction = result.data.NODE_ENV === NodeEnvironment.Production;
  return {
    ...result.data,
    COOKIE_SECURE: result.data.COOKIE_SECURE ?? isProduction,
    API_DOCS_ENABLED: result.data.API_DOCS_ENABLED ?? !isProduction,
  };
}

export const env: ApiEnv = parseEnv();
