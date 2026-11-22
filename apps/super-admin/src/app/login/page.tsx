'use client';

import { ApiClientError, CLIENT_ROLES, type LoginResponse } from '@smart-light/shared';
import { Alert, BrandMark, Button, Card, Field, Input, SkipLink } from '@smart-light/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useState, type FormEvent } from 'react';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { api } from '@/lib/api';

const ALLOWED = new Set<string>(CLIENT_ROLES.superAdmin);
const KNOWN_ERRORS = new Set([
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'ACCOUNT_DISABLED',
  'TENANT_SUSPENDED',
  'WRONG_PORTAL',
  'NETWORK_ERROR',
]);

/** Only allow redirects back into this app (no open redirects). */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function LoginForm() {
  const t = useTranslations('Login');
  const tCommon = useTranslations('Common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorCode(null);
    try {
      const { user } = await api.request<LoginResponse>('/v1/auth/login', {
        method: 'POST',
        body: { email, password, client: 'web' },
      });
      if (!ALLOWED.has(user.role)) {
        await api.request('/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
        setErrorCode('WRONG_PORTAL');
        return;
      }
      queryClient.setQueryData(['session'], user);
      router.replace(safeNext(searchParams.get('next')));
    } catch (error) {
      setErrorCode(error instanceof ApiClientError ? error.code : 'generic');
    } finally {
      setSubmitting(false);
    }
  }

  const errorMessage = errorCode
    ? t(`errors.${(KNOWN_ERRORS.has(errorCode) ? errorCode : 'generic') as 'generic'}`)
    : null;

  return (
    <main id="main-content" className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandMark className="size-11" />
            <div className="leading-tight">
              <p className="font-semibold">{tCommon('productName')}</p>
              <p className="text-sm text-muted-foreground">{tCommon('consoleName')}</p>
            </div>
          </div>
          <LocaleSwitcher />
        </div>

        <Card className="p-6 sm:p-8">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('subtitle')}</p>

          <form className="mt-6 grid gap-4" onSubmit={onSubmit} noValidate>
            {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}
            <Field label={t('email')} required>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </Field>
            <Field label={t('password')} required>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>
            <Button type="submit" size="lg" disabled={submitting || !email || !password}>
              {submitting ? t('submitting') : t('submit')}
            </Button>
          </form>
        </Card>

        <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('notice')}
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  const tCommon = useTranslations('Common');
  return (
    <>
      <SkipLink label={tCommon('skipToContent')} />
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
