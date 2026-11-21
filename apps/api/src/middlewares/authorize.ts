import type { UserRoleName } from '@smart-light/shared';
import type { NextFunction, Request, Response } from 'express';
import { getAuth } from '../modules/auth/auth.context';
import { errors } from '../utils/errors';

/** Allows the request only for the listed roles. Use after `authenticate`. */
export function requireRoles(...roles: UserRoleName[]) {
  const allowed = new Set<UserRoleName>(roles);
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!allowed.has(getAuth(res).role)) {
      throw errors.forbidden();
    }
    next();
  };
}
