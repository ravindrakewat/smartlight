import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

/** Client-supplied request IDs are accepted only if they are short and log-safe. */
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function resolveRequestId(incoming: string | undefined): string {
  const trimmed = incoming?.trim();
  return trimmed && SAFE_REQUEST_ID_PATTERN.test(trimmed) ? trimmed : crypto.randomUUID();
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = process.hrtime.bigint();
  const requestId = resolveRequestId(req.header('x-request-id'));

  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    logger.info('HTTP request completed', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
    });
  });

  next();
}
