import { z } from 'zod';
import { httpUrlSchema } from '@smart-light/shared';

const mobileEnvSchema = z.object({
  EXPO_PUBLIC_API_BASE_URL: httpUrlSchema.default('http://localhost:4000/api'),
  EXPO_PUBLIC_APP_NAME: z.string().min(1).default('Smart Street Light Field App'),
});

export type MobileEnv = z.infer<typeof mobileEnvSchema>;

function parseMobileEnv(): MobileEnv {
  const result = mobileEnvSchema.safeParse({
    EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
    EXPO_PUBLIC_APP_NAME: process.env.EXPO_PUBLIC_APP_NAME,
  });

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid mobile environment configuration: ${message}`);
  }

  return result.data;
}

export const mobileEnv: MobileEnv = parseMobileEnv();
