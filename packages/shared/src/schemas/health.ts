import { z } from 'zod';
import { HealthStatus, NodeEnvironment } from '../enums';

export const healthCheckDataSchema = z.object({
  status: z.nativeEnum(HealthStatus),
  service: z.string().min(1),
  version: z.string().min(1),
  environment: z.nativeEnum(NodeEnvironment),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});

export const healthResponseSchema = z.object({
  success: z.literal(true),
  data: healthCheckDataSchema,
  meta: z
    .object({
      timestamp: z.string().datetime(),
      requestId: z.string().optional(),
    })
    .optional(),
});

export type HealthCheckPayload = z.infer<typeof healthCheckDataSchema>;
