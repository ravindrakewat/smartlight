import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@smart-light/db';
import { NodeEnvironment, type ApiErrorResponse } from '@smart-light/shared';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';

/** Maps expected database errors to clean API errors (no SQL details leak out). */
function translateDatabaseError(err: unknown): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return new AppError({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'A record with these details already exists',
      });
    }
    if (err.code === 'P2025') {
      return new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Record not found' });
    }
  }
  return err;
}

/**
 * Errors raised by Express body parsers (`express.json`, `express.urlencoded`).
 * They carry an HTTP 4xx `status` and a machine-readable `type`.
 */
interface BodyParserError extends Error {
  status: number;
  type: string;
}

const BODY_PARSER_ERROR_CODES: Record<string, { code: string; message: string }> = {
  'entity.parse.failed': { code: 'INVALID_JSON', message: 'Malformed JSON request body' },
  'entity.too.large': { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds size limit' },
  'charset.unsupported': {
    code: 'UNSUPPORTED_CHARSET',
    message: 'Unsupported request body charset',
  },
  'encoding.unsupported': {
    code: 'UNSUPPORTED_ENCODING',
    message: 'Unsupported request body encoding',
  },
  'request.aborted': { code: 'REQUEST_ABORTED', message: 'Request was aborted by the client' },
};

function isBodyParserError(err: unknown): err is BodyParserError {
  if (!(err instanceof Error)) {
    return false;
  }
  const candidate = err as Partial<BodyParserError>;
  return (
    typeof candidate.type === 'string' &&
    typeof candidate.status === 'number' &&
    candidate.status >= 400 &&
    candidate.status < 500
  );
}

export function errorHandler(
  rawError: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const err = translateDatabaseError(rawError);
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

  if (isBodyParserError(err)) {
    const mapped = BODY_PARSER_ERROR_CODES[err.type] ?? {
      code: 'BAD_REQUEST',
      message: 'Invalid request body',
    };
    const payload: ApiErrorResponse = {
      success: false,
      error: mapped,
      meta: { timestamp, requestId },
    };

    res.status(err.status).json(payload);
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
