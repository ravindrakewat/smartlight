import { AppError } from './app-error';

/** Factories for the common operational errors, so codes stay consistent. */
export const errors = {
  unauthenticated: (message = 'Authentication required') =>
    new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message }),
  invalidCredentials: () =>
    new AppError({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    }),
  forbidden: (message = 'You do not have permission to perform this action') =>
    new AppError({ statusCode: 403, code: 'FORBIDDEN', message }),
  notFound: (entity: string) =>
    new AppError({ statusCode: 404, code: 'NOT_FOUND', message: `${entity} not found` }),
  conflict: (code: string, message: string) => new AppError({ statusCode: 409, code, message }),
  badRequest: (code: string, message: string) => new AppError({ statusCode: 400, code, message }),
  tooManyRequests: (message = 'Too many requests, please try again later') =>
    new AppError({ statusCode: 429, code: 'TOO_MANY_REQUESTS', message }),
};
