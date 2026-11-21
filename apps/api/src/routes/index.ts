import { Router } from 'express';
import { env } from '../config/env';
import { authRouter } from '../modules/auth/auth.routes';
import { createDocsRouter } from '../modules/docs/docs.routes';
import { healthRouter } from '../modules/health/health.routes';

/** Versioned business API: /api/v1/... */
const v1Router = Router();
v1Router.use('/auth', authRouter);

/** Everything under /api. Health stays unversioned for infrastructure probes. */
export const apiRouter = Router();
apiRouter.use('/health', healthRouter);
apiRouter.use('/v1', v1Router);
if (env.API_DOCS_ENABLED) {
  apiRouter.use(createDocsRouter());
}
