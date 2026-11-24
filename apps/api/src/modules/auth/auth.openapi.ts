import {
  authUserSchema,
  changePasswordSchema,
  loginRequestSchema,
  loginResponseSchema,
  mfaChallengeResponseSchema,
  mfaDisableRequestSchema,
  mfaEnableRequestSchema,
  mfaLoginResponseSchema,
  mfaRecoveryCodesResponseSchema,
  mfaSetupRequestSchema,
  mfaSetupResponseSchema,
  mfaStatusSchema,
  mfaVerifyRequestSchema,
  refreshRequestSchema,
  sessionInfoSchema,
  successEnvelope,
} from '@smart-light/shared';
import { z } from 'zod';
import { AUTHENTICATED, errorResponses, jsonContent, registry } from '../../lib/openapi';

const TAG = 'Auth';

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login',
  tags: [TAG],
  summary: 'Sign in a staff member',
  description:
    'Web consoles (`client: "web"`) receive httpOnly cookies; the mobile app (`client: "mobile"`) ' +
    'receives an access/refresh token pair. Accounts lock for 15 minutes after 5 failed attempts ' +
    '(wrong passwords and wrong two-factor codes count together). If the account uses two-factor ' +
    'sign-in, or its role requires it, the answer is `{ mfa: { status, challengeToken } }` instead ' +
    'of a session: complete it with POST /auth/login/mfa.',
  request: { body: { content: jsonContent(loginRequestSchema) } },
  responses: {
    200: {
      description: 'Signed in, or a two-factor challenge',
      content: jsonContent(
        successEnvelope(z.union([loginResponseSchema, mfaChallengeResponseSchema])),
      ),
    },
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

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login/mfa',
  tags: [TAG],
  summary: 'Second sign-in step: a 6-digit code or a recovery code',
  description:
    'Completes a challenge from /auth/login. For a `setup` challenge, call /auth/login/mfa/setup ' +
    'first; the answer then also carries the recovery codes, shown once. A challenge lasts 5 ' +
    'minutes and allows 5 wrong codes; a code is never accepted twice.',
  request: { body: { content: jsonContent(mfaVerifyRequestSchema) } },
  responses: {
    200: {
      description: 'Signed in',
      content: jsonContent(successEnvelope(mfaLoginResponseSchema)),
    },
    ...errorResponses(400, 401, 403, 429),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login/mfa/setup',
  tags: [TAG],
  summary: 'Enrol an authenticator during sign-in (role requires two-factor)',
  request: { body: { content: jsonContent(mfaSetupRequestSchema) } },
  responses: {
    200: {
      description: 'Secret and QR link',
      content: jsonContent(successEnvelope(mfaSetupResponseSchema)),
    },
    ...errorResponses(401, 409, 429),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/mfa',
  tags: [TAG],
  summary: 'Two-factor status of the signed-in user',
  security: AUTHENTICATED,
  responses: {
    200: { description: 'Status', content: jsonContent(successEnvelope(mfaStatusSchema)) },
    ...errorResponses(401),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/mfa/setup',
  tags: [TAG],
  summary: 'Start turning on two-factor sign-in (admin roles)',
  security: AUTHENTICATED,
  responses: {
    200: {
      description: 'Secret and QR link',
      content: jsonContent(successEnvelope(mfaSetupResponseSchema)),
    },
    ...errorResponses(401, 403, 409, 429),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/mfa/enable',
  tags: [TAG],
  summary: 'Confirm with a code; returns 10 recovery codes, shown once',
  security: AUTHENTICATED,
  request: { body: { content: jsonContent(mfaEnableRequestSchema) } },
  responses: {
    200: {
      description: 'Recovery codes',
      content: jsonContent(successEnvelope(mfaRecoveryCodesResponseSchema)),
    },
    ...errorResponses(400, 401, 403, 409, 429),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/mfa/disable',
  tags: [TAG],
  summary:
    'Turn off two-factor sign-in (needs password and a code; not where the role requires it)',
  security: AUTHENTICATED,
  request: { body: { content: jsonContent(mfaDisableRequestSchema) } },
  responses: { 204: { description: 'Turned off' }, ...errorResponses(400, 401, 403, 409, 429) },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/mfa/recovery-codes',
  tags: [TAG],
  summary: 'Replace the recovery codes (needs a current code)',
  security: AUTHENTICATED,
  request: { body: { content: jsonContent(mfaEnableRequestSchema) } },
  responses: {
    200: {
      description: 'New recovery codes',
      content: jsonContent(successEnvelope(mfaRecoveryCodesResponseSchema)),
    },
    ...errorResponses(400, 401, 409, 429),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/sessions',
  tags: [TAG],
  summary: 'Devices signed in to this account',
  security: AUTHENTICATED,
  responses: {
    200: {
      description: 'Sessions',
      content: jsonContent(successEnvelope(z.array(sessionInfoSchema))),
    },
    ...errorResponses(401),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/sessions/revoke-others',
  tags: [TAG],
  summary: 'Sign out every other device',
  security: AUTHENTICATED,
  responses: {
    200: {
      description: 'Number of sessions ended',
      content: jsonContent(successEnvelope(z.object({ revoked: z.number().int() }))),
    },
    ...errorResponses(401),
  },
});
