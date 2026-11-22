import { createApiClient } from '@smart-light/shared';
import { superAdminEnv } from './env';

const baseUrl = superAdminEnv.NEXT_PUBLIC_API_BASE_URL;

/**
 * Browser API client. Auth lives in httpOnly cookies set by the API, so the
 * page's JavaScript never sees a token. On a 401 the client rotates the
 * refresh cookie once and retries.
 */
export const api = createApiClient({
  baseUrl,
  credentials: 'include',
  onUnauthorized: async () => {
    try {
      const response = await fetch(`${baseUrl}/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      return response.ok;
    } catch {
      return false;
    }
  },
});
