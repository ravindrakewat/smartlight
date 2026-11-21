import type { Request, Response } from 'express';
import { HealthStatus, type ApiSuccessResponse, type HealthCheckData } from '@smart-light/shared';
import { env } from '../config/env';

export function getHealth(_req: Request, res: Response): void {
  const timestamp = new Date().toISOString();
  const requestId = typeof res.locals.requestId === 'string' ? res.locals.requestId : undefined;

  const payload: ApiSuccessResponse<HealthCheckData> = {
    success: true,
    data: {
      status: HealthStatus.Ok,
      service: env.SERVICE_NAME,
      version: env.APP_VERSION,
      environment: env.NODE_ENV,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp,
    },
    meta: {
      timestamp,
      requestId,
    },
  };

  res.status(200).json(payload);
}
