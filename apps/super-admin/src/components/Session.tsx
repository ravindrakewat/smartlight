'use client';

import { ApiClientError, CLIENT_ROLES, type AuthUser } from '@smart-light/shared';
import { Alert, Button, Skeleton } from '@smart-light/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { api } from '@/lib/api';

const SessionContext = createContext<AuthUser | null>(null);

/** The signed-in user. Only usable inside <SessionGuard>. */
export function useSessionUser(): AuthUser {
  const user = useContext(SessionContext);
  if (!user) {
    throw new Error('useSessionUser must be used inside SessionGuard');
  }
  return user;
}

const ALLOWED = new Set<string>(CLIENT_ROLES.superAdmin);

export function useSignOut() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return async () => {
    try {
      await api.request('/v1/auth/logout', { method: 'POST' });
    } finally {
      queryClient.clear();
      router.replace('/login');
    }
  };
}

/** Loads the session; sends anonymous visitors to /login and blocks other roles. */
export function SessionGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('Common');
  const signOut = useSignOut();
  const {
    data: user,
    error,
    isPending,
  } = useQuery({
    queryKey: ['session'],
    queryFn: () => api.request<AuthUser>('/v1/auth/me'),
    staleTime: 5 * 60_000,
  });

  const unauthenticated = error instanceof ApiClientError && error.status === 401;
  useEffect(() => {
    if (unauthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [unauthenticated, pathname, router]);

  if (isPending || unauthenticated) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <span className="sr-only">{t('loading')}</span>
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (error || !user) {
    return (
      <Alert tone="danger" title={t('errorTitle')}>
        {t('errorBody')}
      </Alert>
    );
  }
  if (!ALLOWED.has(user.role)) {
    return (
      <Alert tone="warning" title={t('notAllowedTitle')}>
        <p>{t('notAllowedBody')}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void signOut()}>
          <LogOut />
          {t('signOut')}
        </Button>
      </Alert>
    );
  }
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/** Name, role and sign-out in the top bar. */
export function UserMenu() {
  const t = useTranslations('Common');
  const locale = useLocale();
  const signOut = useSignOut();
  const { data: user } = useQuery({
    queryKey: ['session'],
    queryFn: () => api.request<AuthUser>('/v1/auth/me'),
    staleTime: 5 * 60_000,
  });
  if (!user) {
    return null;
  }
  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-right leading-tight sm:block">
        <p className="text-sm font-semibold">{user.name}</p>
        <p className="text-xs text-muted-foreground">
          {t(`roles.${user.role}`)}
          {user.tenant ? ` · ${locale === 'hi' ? user.tenant.nameHi : user.tenant.name}` : ''}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('signOut')}
        title={t('signOut')}
        onClick={() => void signOut()}
      >
        <LogOut />
      </Button>
    </div>
  );
}
