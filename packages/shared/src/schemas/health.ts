import { z } from 'zod';
import { HealthStatus, NodeEnvironment } from '../enums';

export const healthCheckDataSchema = z
  .object({
    status: z.enum(HealthStatus),
    service: z.string().min(1),
    version: z.string().min(1),
    environment: z.enum(NodeEnvironment),
    uptimeSeconds: z.number().nonnegative(),
    timestamp: z.iso.datetime(),
    /** Dependency checks; present on the readiness endpoint. */
    checks: z.object({ database: z.enum(['ok', 'error']) }).optional(),
  })
  .meta({ id: 'HealthCheck' });

export const healthResponseSchema = z.object({
  success: z.literal(true),
  data: healthCheckDataSchema,
  meta: z
    .object({
      timestamp: z.iso.datetime(),
      requestId: z.string().optional(),
    })
    .optional(),
});

/** Single source of truth: the type is derived from the Zod schema. */
export type HealthCheckData = z.infer<typeof healthCheckDataSchema>;
