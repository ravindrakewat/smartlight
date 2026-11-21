import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { NodeEnvironment, type ApiErrorResponse } from '@smart-light/shared';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';

function isJsonSyntaxError(err: unknown): err is SyntaxError & { status?: number } {
  return (
    err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400
  );
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = typeof res.locals.requestId === 'string' ? res.locals.requestId : undefined;
  const timestamp = new Date().toISOString();

  if (err instanceof AppError) {
    const payload: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
      meta: { timestamp, requestId },
    };

    if (err.statusCode >= 500) {
      logger.error('Operational server error', {
        requestId,
        code: err.code,
        message: err.message,
        path: req.originalUrl,
      });
    }

    res.status(err.statusCode).json(payload);
    return;
  }

  if (err instanceof ZodError) {
    const payload: ApiErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((issue) => ({
          field: issue.path.join('.') || undefined,
          message: issue.message,
        })),
      },
      meta: { timestamp, requestId },
    };

    res.status(400).json(payload);
    return;
  }

  if (isJsonSyntaxError(err)) {
    const payload: ApiErrorResponse = {
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON request body',
      },
      meta: { timestamp, requestId },
    };

    res.status(400).json(payload);
    return;
  }

  logger.error('Unhandled server error', {
    requestId,
    path: req.originalUrl,
    errorName: err instanceof Error ? err.name : 'UnknownError',
    errorMessage: err instanceof Error ? err.message : String(err),
    ...(env.NODE_ENV !== NodeEnvironment.Production && err instanceof Error
      ? { stack: err.stack }
      : {}),
  });

  const payload: ApiErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
    meta: { timestamp, requestId },
  };

  res.status(500).json(payload);
}
