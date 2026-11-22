import {
  ApiClientError,
  CLIENT_ROLES,
  type AuthUser,
  type LoginResponse,
} from '@smart-light/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, loadStoredTokens, saveTokens, setSessionExpiredHandler } from './api';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface SessionValue {
  status: Status;
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const ALLOWED = new Set<string>(CLIENT_ROLES.mobile);
const SessionContext = createContext<SessionValue | null>(null);

export class WrongAppError extends Error {}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  const clear = useCallback(() => {
    setUser(null);
    setStatus('signedOut');
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setSessionExpiredHandler(clear);
    void (async () => {
      if (!(await loadStoredTokens())) {
        setStatus('signedOut');
        return;
      }
      try {
        const me = await api.request<AuthUser>('/v1/auth/me');
        setUser(me);
        setStatus(ALLOWED.has(me.role) ? 'signedIn' : 'signedOut');
      } catch (error) {
        // Offline at launch: keep the stored session and let screens retry.
        if (error instanceof ApiClientError && error.code === 'NETWORK_ERROR') {
          setStatus('signedIn');
        } else {
          await saveTokens(null);
          setStatus('signedOut');
        }
      }
    })();
    return () => setSessionExpiredHandler(null);
  }, [clear]);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await api.request<LoginResponse>('/v1/auth/login', {
      method: 'POST',
      body: { email, password, client: 'mobile' },
    });
    if (!response.tokens) {
      throw new Error('Missing tokens');
    }
    await saveTokens(response.tokens);
    if (!ALLOWED.has(response.user.role)) {
      await api.request('/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
      await saveTokens(null);
      throw new WrongAppError();
    }
    setUser(response.user);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    await api.request('/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    await saveTokens(null);
    clear();
  }, [clear]);

  const value = useMemo(() => ({ status, user, signIn, signOut }), [status, user, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return value;
}
