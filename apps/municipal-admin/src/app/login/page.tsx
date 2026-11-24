'use client';

import {
  ApiClientError,
  CLIENT_ROLES,
  isMfaChallenge,
  type AuthUser,
  type LoginResult,
  type MfaChallengeResponse,
  type MfaLoginResponse,
  type MfaSetupResponse,
} from '@smart-light/shared';
import {
  Alert,
  BrandMark,
  Button,
  Card,
  CodeForm,
  EnrolPanel,
  Field,
  Input,
  RecoveryCodesPanel,
  SkipLink,
  Spinner,
} from '@smart-light/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { api } from '@/lib/api';

const ALLOWED = new Set<string>(CLIENT_ROLES.municipalAdmin);
const KNOWN_ERRORS = new Set([
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'ACCOUNT_DISABLED',
  'TENANT_SUSPENDED',
  'WRONG_PORTAL',
  'NETWORK_ERROR',
  'INVALID_MFA_CODE',
  'MFA_CHALLENGE_INVALID',
]);

/** Only allow redirects back into this app (no open redirects). */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

type Step =
  | { kind: 'password' }
  | { kind: 'code'; challenge: MfaChallengeResponse['mfa'] }
  | { kind: 'setup'; challenge: MfaChallengeResponse['mfa']; setup: MfaSetupResponse | null }
  | { kind: 'codes'; user: AuthUser; codes: string[] };

function LoginForm() {
  const t = useTranslations('Login');
  const tMfa = useTranslations('Mfa');
  const tCommon = useTranslations('Common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'password' });

  const errorText = (code: string | null) =>
    code ? t(`errors.${(KNOWN_ERRORS.has(code) ? code : 'generic') as 'generic'}`) : null;

  /** Signed in: check this console is the right one, then go in. */
  async function finish(user: AuthUser) {
    if (!ALLOWED.has(user.role)) {
      await api.request('/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
      setStep({ kind: 'password' });
      setErrorCode('WRONG_PORTAL');
      return;
    }
    queryClient.setQueryData(['session'], user);
    router.replace(safeNext(searchParams.get('next')));
  }

  /** A failed second step: an expired challenge or a lock sends the person back to the password. */
  function secondStepFailed(error: unknown) {
    const code = error instanceof ApiClientError ? error.code : 'generic';
    if (code === 'MFA_CHALLENGE_INVALID' || code === 'ACCOUNT_LOCKED') {
      setPassword('');
      setStep({ kind: 'password' });
    }
    setErrorCode(code);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorCode(null);
    try {
      const result = await api.request<LoginResult>('/v1/auth/login', {
        method: 'POST',
        body: { email, password, client: 'web' },
      });
      if (isMfaChallenge(result)) {
        setStep(
          result.mfa.status === 'setup'
            ? { kind: 'setup', challenge: result.mfa, setup: null }
            : { kind: 'code', challenge: result.mfa },
        );
        return;
      }
      await finish(result.user);
    } catch (error) {
      setErrorCode(error instanceof ApiClientError ? error.code : 'generic');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCode(challengeToken: string, code: string) {
    setErrorCode(null);
    try {
      const result = await api.request<MfaLoginResponse>('/v1/auth/login/mfa', {
        method: 'POST',
        body: { challengeToken, code },
      });
      if (result.recoveryCodes?.length) {
        setStep({ kind: 'codes', user: result.user, codes: result.recoveryCodes });
        return;
      }
      await finish(result.user);
    } catch (error) {
      secondStepFailed(error);
    }
  }

  // A `setup` challenge: fetch the new secret once.
  const setupToken = step.kind === 'setup' && !step.setup ? step.challenge.challengeToken : null;
  useEffect(() => {
    if (!setupToken) return;
    api
      .request<MfaSetupResponse>('/v1/auth/login/mfa/setup', {
        method: 'POST',
        body: { challengeToken: setupToken },
      })
      .then((setup) =>
        setStep((current) => (current.kind === 'setup' ? { ...current, setup } : current)),
      )
      .catch((error: unknown) => {
        setStep({ kind: 'password' });
        setErrorCode(error instanceof ApiClientError ? error.code : 'generic');
      });
  }, [setupToken]);

  const codeLabels = {
    code: tMfa('code'),
    codeHint: tMfa('codeHint'),
    submit: tMfa('verify'),
    submitting: tMfa('verifying'),
  };
  const backToPassword = (
    <Button
      type="button"
      variant="ghost"
      onClick={() => {
        setErrorCode(null);
        setStep({ kind: 'password' });
      }}
    >
      {tMfa('back')}
    </Button>
  );

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
          {step.kind === 'password' ? (
            <>
              <h1 className="text-2xl font-semibold">{t('title')}</h1>
              <p className="mt-1 text-muted-foreground">{t('subtitle')}</p>

              <form className="mt-6 grid gap-4" onSubmit={onSubmit} noValidate>
                {errorText(errorCode) ? <Alert tone="danger">{errorText(errorCode)}</Alert> : null}
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
            </>
          ) : step.kind === 'code' ? (
            <>
              <h1 className="text-2xl font-semibold">{tMfa('verifyTitle')}</h1>
              <p className="mt-1 mb-6 text-muted-foreground">{tMfa('verifyBody')}</p>
              <CodeForm
                labels={codeLabels}
                error={errorText(errorCode)}
                onSubmit={(code) => submitCode(step.challenge.challengeToken, code)}
              />
              <div className="mt-2">{backToPassword}</div>
            </>
          ) : step.kind === 'setup' ? (
            <>
              <h1 className="text-2xl font-semibold">{tMfa('setupTitle')}</h1>
              <p className="mt-1 mb-6 text-muted-foreground">{tMfa('setupBody')}</p>
              {step.setup ? (
                <div className="grid gap-6">
                  <EnrolPanel
                    labels={{
                      steps: tMfa('setupSteps'),
                      qrLabel: tMfa('qrLabel'),
                      manual: tMfa('manual'),
                    }}
                    secret={step.setup.secret}
                    otpauthUri={step.setup.otpauthUri}
                  />
                  <CodeForm
                    labels={{ ...codeLabels, codeHint: tMfa('setupCodeHint') }}
                    error={errorText(errorCode)}
                    onSubmit={(code) => submitCode(step.challenge.challengeToken, code)}
                  />
                </div>
              ) : errorCode ? (
                <Alert tone="danger">{errorText(errorCode)}</Alert>
              ) : (
                <Spinner label={tCommon('loading')} />
              )}
              <div className="mt-2">{backToPassword}</div>
            </>
          ) : (
            <>
              <h1 className="mb-6 text-2xl font-semibold">{tMfa('doneTitle')}</h1>
              <RecoveryCodesPanel
                labels={{
                  title: tMfa('recovery.title'),
                  body: tMfa('recovery.body'),
                  copy: tMfa('recovery.copy'),
                  copied: tMfa('recovery.copied'),
                  download: tMfa('recovery.download'),
                  fileName: tMfa('recovery.fileName'),
                  confirm: tMfa('recovery.confirm'),
                  continue: tMfa('recovery.continue'),
                }}
                codes={step.codes}
                onContinue={() => void finish(step.user)}
              />
            </>
          )}
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
