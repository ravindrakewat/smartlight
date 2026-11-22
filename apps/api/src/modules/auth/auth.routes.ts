import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authRateLimit } from '../../middlewares/rate-limit';
import { authController } from './auth.controller';
import './auth.openapi';

export const authRouter = Router();

authRouter.post('/login', authRateLimit, authController.login);
authRouter.post('/refresh', authRateLimit, authController.refresh);
authRouter.post('/logout', authenticate, authController.logout);
authRouter.get('/me', authenticate, authController.me);
authRouter.post('/change-password', authRateLimit, authenticate, authController.changePassword);
