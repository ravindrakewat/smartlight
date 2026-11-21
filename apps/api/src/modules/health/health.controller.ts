import { HealthStatus, type HealthCheckData } from '@smart-light/shared';
import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { sendData } from '../../lib/http';
import { prisma } from '../../lib/prisma';

const DATABASE_CHECK_TIMEOUT_MS = 2_000;

function baseHealth(status: HealthStatus): HealthCheckData {
  return {
    status,
    service: env.SERVICE_NAME,
    version: env.APP_VERSION,
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

async function databaseReachable(): Promise<boolean> {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), DATABASE_CHECK_TIMEOUT_MS),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

export const healthController = {
  /** Liveness: the process is up. Used by Render's health check. */
  live(_req: Request, res: Response): void {
    sendData(res, baseHealth(HealthStatus.Ok));
  },

  /** Readiness: dependencies are reachable. 503 when the database is down. */
  async ready(_req: Request, res: Response): Promise<void> {
    const databaseOk = await databaseReachable();
    sendData(
      res,
      {
        ...baseHealth(databaseOk ? HealthStatus.Ok : HealthStatus.Degraded),
        checks: { database: databaseOk ? 'ok' : 'error' },
      },
      databaseOk ? 200 : 503,
    );
  },
};
