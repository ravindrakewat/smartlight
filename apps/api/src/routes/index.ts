import { Router } from 'express';
import { env } from '../config/env';
import { agenciesRouter } from '../modules/agencies/agencies.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { dashboardRouter } from '../modules/dashboard/dashboard.module';
import { devicesRouter } from '../modules/devices/devices.module';
import { createDocsRouter } from '../modules/docs/docs.routes';
import { healthRouter } from '../modules/health/health.routes';
import { polesRouter } from '../modules/poles/poles.routes';
import { publicTenantsRouter, tenantsRouter } from '../modules/tenants/tenants.routes';
import { usersRouter } from '../modules/users/users.routes';
import { zonesRouter } from '../modules/zones/zones.module';

/** Unauthenticated endpoints for the citizen portal. */
const publicRouter = Router();
publicRouter.use('/tenants', publicTenantsRouter);

/** Versioned business API: /api/v1/... */
const v1Router = Router();
v1Router.use('/auth', authRouter);
v1Router.use('/public', publicRouter);
v1Router.use('/tenants', tenantsRouter);
v1Router.use('/agencies', agenciesRouter);
v1Router.use('/users', usersRouter);
v1Router.use('/zones', zonesRouter);
v1Router.use('/poles', polesRouter);
v1Router.use('/devices', devicesRouter);
v1Router.use('/dashboard', dashboardRouter);

/** Everything under /api. Health stays unversioned for infrastructure probes. */
export const apiRouter = Router();
apiRouter.use('/health', healthRouter);
apiRouter.use('/v1', v1Router);
if (env.API_DOCS_ENABLED) {
  apiRouter.use(createDocsRouter());
}
