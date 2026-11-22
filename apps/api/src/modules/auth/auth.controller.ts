import {
  AUTH_COOKIES,
  changePasswordSchema,
  loginRequestSchema,
  refreshRequestSchema,
  type LoginResponse,
} from '@smart-light/shared';
import type { Request, Response } from 'express';
import { sendData } from '../../lib/http';
import { errors } from '../../utils/errors';
import { getAuth } from './auth.context';
import { clearAuthCookies, setAuthCookies } from './auth.cookies';
import { authService, type IssuedSession } from './auth.service';

function respondWithSession(res: Response, issued: IssuedSession, client: 'web' | 'mobile'): void {
  if (client === 'web') {
    setAuthCookies(res, issued.tokens);
    sendData<LoginResponse>(res, { user: issued.user });
  } else {
    sendData<LoginResponse>(res, { user: issued.user, tokens: issued.tokens });
  }
}

export const authController = {
  async login(req: Request, res: Response): Promise<void> {
    const input = loginRequestSchema.parse(req.body);
    const issued = await authService.login(input, req);
    respondWithSession(res, issued, input.client);
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const body = refreshRequestSchema.parse(req.body ?? {});
    const cookieToken: unknown = req.cookies?.[AUTH_COOKIES.refreshToken];
    const token = body.refreshToken ?? (typeof cookieToken === 'string' ? cookieToken : undefined);
    if (!token) {
      throw errors.unauthenticated('Refresh token missing');
    }
    const issued = await authService.refresh(token, req);
    respondWithSession(res, issued, body.refreshToken ? 'mobile' : 'web');
  },

  async logout(req: Request, res: Response): Promise<void> {
    await authService.logout(getAuth(res), req);
    clearAuthCookies(res);
    res.status(204).end();
  },

  async changePassword(req: Request, res: Response): Promise<void> {
    const input = changePasswordSchema.parse(req.body);
    await authService.changePassword(getAuth(res), input, req);
    res.status(204).end();
  },

  async me(_req: Request, res: Response): Promise<void> {
    sendData(res, await authService.me(getAuth(res)));
  },
};
