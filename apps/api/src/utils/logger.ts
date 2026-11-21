import pino from 'pino';
import { NodeEnvironment } from '@smart-light/shared';
import { env } from '../config/env';

/**
 * Structured JSON logger (pino). Secrets are redacted at the source so they can
 * never reach log storage, even if a caller logs a whole request or user object.
 */
const pinoLogger = pino({
  level: env.LOG_LEVEL,
  base: { service: env.SERVICE_NAME, version: env.APP_VERSION },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'password',
      '*.password',
      'passwordHash',
      '*.passwordHash',
      'token',
      '*.token',
      'accessToken',
      '*.accessToken',
      'refreshToken',
      '*.refreshToken',
      'otp',
      '*.otp',
      'authorization',
      '*.authorization',
      'cookie',
      '*.cookie',
      'headers.authorization',
      'headers.cookie',
    ],
    censor: '[REDACTED]',
  },
  ...(env.NODE_ENV === NodeEnvironment.Development
    ? { transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } }
    : {}),
});

type LogContext = Record<string, unknown>;

/** Thin wrapper keeping a `(message, context)` call style across the codebase. */
export const logger = {
  debug: (message: string, context?: LogContext) => pinoLogger.debug(context ?? {}, message),
  info: (message: string, context?: LogContext) => pinoLogger.info(context ?? {}, message),
  warn: (message: string, context?: LogContext) => pinoLogger.warn(context ?? {}, message),
  error: (message: string, context?: LogContext) => pinoLogger.error(context ?? {}, message),
};
