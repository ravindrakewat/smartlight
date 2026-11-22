import { createApiClient } from '@smart-light/shared';
import { citizenEnv } from './env';

/** Citizen session is an httpOnly cookie scoped to the public API. */
export const api = createApiClient({
  baseUrl: citizenEnv.NEXT_PUBLIC_API_BASE_URL,
  credentials: 'include',
});
