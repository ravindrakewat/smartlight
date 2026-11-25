import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { startSlaEscalation } from './modules/work-orders/sla-escalation';
import { logger } from './utils/logger';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = createApp();
const server = http.createServer(app);

let isShuttingDown = false;

function gracefulShutdown(signal: string): void {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info('Shutdown signal received; closing HTTP server', { signal });

  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out; forcing exit', {
      timeoutMs: SHUTDOWN_TIMEOUT_MS,
    });
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  server.close((err) => {
    clearTimeout(forceExitTimer);
    if (err) {
      logger.error('Error while closing HTTP server', { errorMessage: err.message });
      process.exit(1);
    }

    logger.info('HTTP server closed cleanly');
    void prisma
      .$disconnect()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
}

server.listen(env.PORT, env.API_HOST, () => {
  logger.info('Central API server started', {
    host: env.API_HOST,
    port: env.PORT,
    environment: env.NODE_ENV,
    healthEndpoint: `/api/health`,
  });
});

// Marks overdue work orders once and tells the technician and supervisors.
startSlaEscalation(env.SLA_SWEEP_INTERVAL_SECONDS);

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  gracefulShutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    errorName: error.name,
    errorMessage: error.message,
  });
  gracefulShutdown('uncaughtException');
});
