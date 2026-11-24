import {
  AUTH_COOKIES,
  changePasswordSchema,
  loginRequestSchema,
  mfaDisableRequestSchema,
  mfaEnableRequestSchema,
  mfaSetupRequestSchema,
  mfaVerifyRequestSchema,
  refreshRequestSchema,
  type MfaLoginResponse,
} from '@smart-light/shared';
import type { Request, Response } from 'express';
import { sendData } from '../../lib/http';
import { errors } from '../../utils/errors';
import { getAuth } from './auth.context';
import { clearAuthCookies, setAuthCookies } from './auth.cookies';
import { authService, type IssuedSession } from './auth.service';
import { mfaService } from './mfa.service';

function respondWithSession(
  res: Response,
  issued: IssuedSession,
  client: 'web' | 'mobile',
  extra: Pick<MfaLoginResponse, 'recoveryCodes'> = {},
): void {
  if (client === 'web') {
    setAuthCookies(res, issued.tokens);
    sendData<MfaLoginResponse>(res, { user: issued.user, ...extra });
  } else {
    sendData<MfaLoginResponse>(res, { user: issued.user, tokens: issued.tokens, ...extra });
  }
}

export const authController = {
  async login(req: Request, res: Response): Promise<void> {
    const input = loginRequestSchema.parse(req.body);
    const result = await authService.login(input, req);
    if ('mfa' in result) {
      // No session yet: the second step completes the sign-in.
      sendData(res, result);
      return;
    }
    respondWithSession(res, result, input.client);
  },

  async loginMfa(req: Request, res: Response): Promise<void> {
    const input = mfaVerifyRequestSchema.parse(req.body);
    const { issued, client, recoveryCodes } = await mfaService.completeLogin(
      input.challengeToken,
      input.code,
      req,
    );
    respondWithSession(res, issued, client, recoveryCodes ? { recoveryCodes } : {});
  },

  async loginMfaSetup(req: Request, res: Response): Promise<void> {
    const { challengeToken } = mfaSetupRequestSchema.parse(req.body);
    if (!challengeToken) {
      throw errors.unauthenticated('Challenge token missing');
    }
    sendData(res, await mfaService.setupFromChallenge(challengeToken));
  },

  async mfaStatus(_req: Request, res: Response): Promise<void> {
    sendData(res, await mfaService.status(getAuth(res)));
  },

  async mfaSetup(_req: Request, res: Response): Promise<void> {
    sendData(res, await mfaService.setupSignedIn(getAuth(res)));
  },

  async mfaEnable(req: Request, res: Response): Promise<void> {
    const { code } = mfaEnableRequestSchema.parse(req.body);
    sendData(res, { recoveryCodes: await mfaService.enable(getAuth(res), code, req) });
  },

  async mfaDisable(req: Request, res: Response): Promise<void> {
    const { password, code } = mfaDisableRequestSchema.parse(req.body);
    await mfaService.disable(getAuth(res), password, code, req);
    res.status(204).end();
  },

  async mfaRecoveryCodes(req: Request, res: Response): Promise<void> {
    const { code } = mfaEnableRequestSchema.parse(req.body);
    sendData(res, {
      recoveryCodes: await mfaService.regenerateRecoveryCodes(getAuth(res), code, req),
    });
  },

  async sessions(_req: Request, res: Response): Promise<void> {
    sendData(res, await mfaService.sessions(getAuth(res)));
  },

  async revokeOtherSessions(req: Request, res: Response): Promise<void> {
    sendData(res, { revoked: await mfaService.revokeOtherSessions(getAuth(res), req) });
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
