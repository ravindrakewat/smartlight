import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authRateLimit } from '../../middlewares/rate-limit';
import { authController } from './auth.controller';
import './auth.openapi';

export const authRouter = Router();

authRouter.post('/login', authRateLimit, authController.login);
authRouter.post('/login/mfa', authRateLimit, authController.loginMfa);
authRouter.post('/login/mfa/setup', authRateLimit, authController.loginMfaSetup);
authRouter.post('/refresh', authRateLimit, authController.refresh);
authRouter.post('/logout', authenticate, authController.logout);
authRouter.get('/me', authenticate, authController.me);
authRouter.post('/change-password', authRateLimit, authenticate, authController.changePassword);

// Two-factor sign-in for the signed-in user
authRouter.get('/mfa', authenticate, authController.mfaStatus);
authRouter.post('/mfa/setup', authRateLimit, authenticate, authController.mfaSetup);
authRouter.post('/mfa/enable', authRateLimit, authenticate, authController.mfaEnable);
authRouter.post('/mfa/disable', authRateLimit, authenticate, authController.mfaDisable);
authRouter.post(
  '/mfa/recovery-codes',
  authRateLimit,
  authenticate,
  authController.mfaRecoveryCodes,
);

// Signed-in devices
authRouter.get('/sessions', authenticate, authController.sessions);
authRouter.post('/sessions/revoke-others', authenticate, authController.revokeOtherSessions);
