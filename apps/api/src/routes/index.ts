import { Router } from 'express';
import { env } from '../config/env';
import { agenciesRouter } from '../modules/agencies/agencies.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { citizenAuthRouter } from '../modules/citizen-auth/citizen-auth.module';
import { complaintsRouter, publicComplaintsRouter } from '../modules/complaints/complaints.routes';
import { dashboardRouter } from '../modules/dashboard/dashboard.module';
import { devicesRouter } from '../modules/devices/devices.module';
import { createDocsRouter } from '../modules/docs/docs.routes';
import { healthRouter } from '../modules/health/health.routes';
import { alertsRouter, lightingRouter, poleLiveRouter } from '../modules/iot/lighting.module';
import { schedulesRouter, zoneScheduleRouter } from '../modules/iot/schedules.module';
import { gatewaysRouter, lorawanRouter } from '../modules/lorawan/lorawan.module';
import { auditRouter, deviceListRouter } from '../modules/platform/platform.module';
import { sparePartsRouter } from '../modules/inventory/inventory.module';
import { notificationsRouter } from '../modules/notifications/notifications.module';
import { reportsRouter } from '../modules/reports/reports.module';
import { polesRouter } from '../modules/poles/poles.routes';
import { publicTenantsRouter, tenantsRouter } from '../modules/tenants/tenants.routes';
import { usersRouter } from '../modules/users/users.routes';
import { workOrdersRouter } from '../modules/work-orders/work-orders.routes';
import { zonesRouter } from '../modules/zones/zones.module';

/** Unauthenticated endpoints for the citizen portal. */
const publicRouter = Router();
publicRouter.use('/tenants', publicTenantsRouter);
publicRouter.use(citizenAuthRouter);
publicRouter.use(publicComplaintsRouter);

/** Versioned business API: /api/v1/... */
const v1Router = Router();
v1Router.use('/auth', authRouter);
v1Router.use('/public', publicRouter);
v1Router.use('/tenants', tenantsRouter);
v1Router.use('/agencies', agenciesRouter);
v1Router.use('/users', usersRouter);
v1Router.use('/zones', zoneScheduleRouter);
v1Router.use('/zones', zonesRouter);
v1Router.use('/poles', poleLiveRouter);
v1Router.use('/poles', polesRouter);
v1Router.use('/lighting', lightingRouter);
v1Router.use('/alerts', alertsRouter);
v1Router.use('/schedules', schedulesRouter);
v1Router.use('/devices', deviceListRouter);
v1Router.use('/devices', devicesRouter);
v1Router.use('/reports', reportsRouter);
v1Router.use('/spare-parts', sparePartsRouter);
v1Router.use('/notifications', notificationsRouter);
v1Router.use('/audit', auditRouter);
v1Router.use('/dashboard', dashboardRouter);
v1Router.use('/work-orders', workOrdersRouter);
v1Router.use('/complaints', complaintsRouter);
v1Router.use('/lorawan', lorawanRouter);
v1Router.use('/gateways', gatewaysRouter);

/** Everything under /api. Health stays unversioned for infrastructure probes. */
export const apiRouter = Router();
apiRouter.use('/health', healthRouter);
apiRouter.use('/v1', v1Router);
if (env.API_DOCS_ENABLED) {
  apiRouter.use(createDocsRouter());
}
