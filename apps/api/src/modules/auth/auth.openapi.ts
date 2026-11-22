import {
  authUserSchema,
  changePasswordSchema,
  loginRequestSchema,
  loginResponseSchema,
  refreshRequestSchema,
  successEnvelope,
} from '@smart-light/shared';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';

const TAG = 'Auth';

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login',
  tags: [TAG],
  summary: 'Sign in a staff member',
  description:
    'Web consoles (`client: "web"`) receive httpOnly cookies; the mobile app (`client: "mobile"`) ' +
    'receives an access/refresh token pair. Accounts lock for 15 minutes after 5 failed attempts.',
  request: { body: { content: jsonContent(loginRequestSchema) } },
  responses: {
    200: { description: 'Signed in', content: jsonContent(successEnvelope(loginResponseSchema)) },
    ...errorResponses(400, 401, 403, 429),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/refresh',
  tags: [TAG],
  summary: 'Rotate the refresh token and get a new access token',
  description:
    'Web: send the `sl_rt` cookie. Mobile: send `refreshToken` in the body. Re-using an old ' +
    'refresh token revokes every session of that login (stolen-token protection).',
  request: { body: { content: jsonContent(refreshRequestSchema) } },
  responses: {
    200: { description: 'New tokens', content: jsonContent(successEnvelope(loginResponseSchema)) },
    ...errorResponses(401),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/logout',
  tags: [TAG],
  summary: 'Sign out (revokes the current session)',
  security: AUTHENTICATED,
  responses: { 204: { description: 'Signed out' }, ...errorResponses(401) },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/me',
  tags: [TAG],
  summary: 'Current user with tenant and agency',
  security: AUTHENTICATED,
  responses: {
    200: { description: 'Current user', content: jsonContent(successEnvelope(authUserSchema)) },
    ...errorResponses(401),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/change-password',
  tags: [TAG],
  summary: 'Change your own password (other devices are signed out)',
  security: AUTHENTICATED,
  request: { body: { content: jsonContent(changePasswordSchema) } },
  responses: {
    204: { description: 'Password changed' },
    ...errorResponses(400, 401, 429),
  },
});
