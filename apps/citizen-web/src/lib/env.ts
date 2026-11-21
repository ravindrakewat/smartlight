import { z } from 'zod';
import { httpUrlSchema } from '@smart-light/shared';

const citizenEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: httpUrlSchema.default('http://localhost:4000/api'),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('Citizen Street Light Portal'),
});

export type CitizenEnv = z.infer<typeof citizenEnvSchema>;

function parseCitizenEnv(): CitizenEnv {
  const result = citizenEnvSchema.safeParse({
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  });

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid citizen-web environment configuration: ${message}`);
  }

  return result.data;
}

export const citizenEnv: CitizenEnv = parseCitizenEnv();
