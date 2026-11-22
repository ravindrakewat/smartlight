import { z } from 'zod';
import { apiBaseUrlSchema } from '@smart-light/shared';

const municipalEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: apiBaseUrlSchema.default('http://localhost:4000/api'),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('Municipal Operations Admin'),
});

export type MunicipalEnv = z.infer<typeof municipalEnvSchema>;

function parseMunicipalEnv(): MunicipalEnv {
  const result = municipalEnvSchema.safeParse({
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  });

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid municipal-admin environment configuration: ${message}`);
  }

  return result.data;
}

export const municipalEnv: MunicipalEnv = parseMunicipalEnv();
