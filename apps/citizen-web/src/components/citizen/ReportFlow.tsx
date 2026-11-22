'use client';

import {
  ApiClientError,
  COMPLAINT_CATEGORIES,
  parsePoleCode,
  type ComplaintCategoryName,
  type CreateComplaintInput,
  type PublicComplaintDto,
  type PublicPoleDto,
} from '@smart-light/shared';
import { Alert, Button, Card, Field, Input, Textarea, cn } from '@smart-light/ui';
import {
  Cable,
  CheckCircle2,
  Copy,
  HelpCircle,
  LightbulbOff,
  LocateFixed,
  Sun,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { citizenEnv } from '@/lib/env';

const CATEGORY_ICONS: Record<ComplaintCategoryName, LucideIcon> = {
  LIGHT_OFF: LightbulbOff,
  FLICKERING: Zap,
  DAY_BURNING: Sun,
  DAMAGED_POLE: TriangleAlert,
  EXPOSED_WIRING: Cable,
  OTHER: HelpCircle,
};

const KNOWN_ERRORS = new Set([
  'INVALID_OTP',
  'OTP_EXPIRED',
  'TOO_MANY_REQUESTS',
  'NOT_FOUND',
  'INVALID_POLE_CODE',
  'NETWORK_ERROR',
]);

type Step = 1 | 2 | 3;
type Location = { latitude: number; longitude: number };

export function ReportFlow() {
  const t = useTranslations('Report');
  const tCategory = useTranslations('Categories');
  const tCommon = useTranslations('Common');
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>(1);
  const [poleInput, setPoleInput] = useState(searchParams.get('pole') ?? '');
  const [poleError, setPoleError] = useState<string | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [locationState, setLocationState] = useState<'idle' | 'locating' | 'denied'>('idle');
  const [category, setCategory] = useState<ComplaintCategoryName | null>(null);
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [needsOtp, setNeedsOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [result, setResult] = useState<{ complaint: PublicComplaintDto; joined: boolean } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const phone = `+91${phoneDigits}`;
  const phoneValid = /^[6-9]\d{9}$/.test(phoneDigits);
  const errorMessage = errorCode
    ? t(`errors.${(KNOWN_ERRORS.has(errorCode) ? errorCode : 'generic') as 'generic'}`)
    : null;

  function fail(error: unknown) {
    setErrorCode(error instanceof ApiClientError ? error.code : 'generic');
  }

  async function confirmPole(event: FormEvent) {
    event.preventDefault();
    setErrorCode(null);
    if (location && !poleInput.trim()) {
      setStep(2);
      return;
    }
    const parsed = parsePoleCode(poleInput);
    if (!parsed) {
      setPoleError(t('poleInvalid'));
      return;
    }
    setBusy(true);
    try {
      await api.request<PublicPoleDto>(`/v1/public/poles/${encodeURIComponent(parsed.code)}`);
      setPoleInput(parsed.code);
      setLocation(null);
      setStep(2);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  function locateMe() {
    if (!('geolocation' in navigator)) {
      setLocationState('denied');
      return;
    }
    setLocationState('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setPoleInput('');
        setPoleError(null);
        setLocationState('idle');
      },
      () => setLocationState('denied'),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  function complaintBody(): CreateComplaintInput {
    return {
      category: category ?? 'OTHER',
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(location
        ? { tenantSlug: citizenEnv.NEXT_PUBLIC_TENANT_SLUG, ...location }
        : { poleCode: poleInput }),
    };
  }

  /** Submits; a returning citizen with a valid session skips the OTP step. */
  async function submit() {
    setBusy(true);
    setErrorCode(null);
    try {
      const created = await api.request<{
        complaint: PublicComplaintDto;
        joinedExistingRepair: boolean;
      }>('/v1/public/complaints', { method: 'POST', body: complaintBody() });
      setResult({ complaint: created.complaint, joined: created.joinedExistingRepair });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setNeedsOtp(true);
      } else {
        fail(error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrorCode(null);
    try {
      await api.request('/v1/public/otp/request', { method: 'POST', body: { phone } });
      setOtpSent(true);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function verifyAndSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrorCode(null);
    try {
      await api.request('/v1/public/otp/verify', { method: 'POST', body: { phone, code } });
      setNeedsOtp(false);
      await submit();
    } catch (error) {
      fail(error);
      setBusy(false);
    }
  }

  // ── Success ──
  if (result) {
    return (
      <Card className="p-6 text-center sm:p-8">
        <CheckCircle2 aria-hidden="true" className="mx-auto size-14 text-success" />
        <h2 className="mt-3 text-2xl font-bold">{t('successTitle')}</h2>
        <p className="mt-2 text-muted-foreground">
          {result.joined ? t('successJoined') : t('successBody')}
        </p>
        <div className="mx-auto mt-6 max-w-sm rounded-xl bg-surface-subtle p-4">
          <p className="text-sm text-muted-foreground">{t('numberLabel')}</p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-wide">
            {result.complaint.number}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(result.complaint.number)
                .then(() => setCopied(true));
            }}
          >
            <Copy />
            {copied ? t('copied') : t('copy')}
          </Button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button asChild size="lg">
            <Link href={{ pathname: '/track', query: { number: result.complaint.number } }}>
              {t('trackIt')}
            </Link>
          </Button>
          <Button size="lg" variant="outline" onClick={() => window.location.reload()}>
            {t('another')}
          </Button>
        </div>
      </Card>
    );
  }

  const steps = [t('steps.pole'), t('steps.problem'), t('steps.verify')];

  return (
    <div className="grid gap-5">
      {/* Progress */}
      <ol
        className="grid grid-cols-3 gap-2"
        aria-label={t('stepStatus', { current: step, total: 3 })}
      >
        {steps.map((label, index) => {
          const number = index + 1;
          return (
            <li key={label} aria-current={number === step ? 'step' : undefined}>
              <div
                className={cn(
                  'h-1.5 rounded-full',
                  number <= step ? 'bg-primary' : 'bg-surface-subtle',
                )}
              />
              <p
                className={cn(
                  'mt-2 text-sm font-medium',
                  number === step ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {number}. {label}
              </p>
            </li>
          );
        })}
      </ol>

      {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}

      <Card className="p-5 sm:p-6">
        {step === 1 ? (
          <form className="grid gap-4" onSubmit={confirmPole} noValidate>
            <Field label={t('poleLabel')} hint={t('poleHint')} error={poleError ?? undefined}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  autoCapitalize="characters"
                  autoComplete="off"
                  placeholder="IND-000000-0"
                  className="font-mono text-lg tracking-wide uppercase"
                  value={poleInput}
                  onChange={(event) => {
                    setPoleInput(event.target.value);
                    setPoleError(null);
                    setLocation(null);
                  }}
                />
              )}
            </Field>

            <Button type="button" variant="ghost" className="justify-start" onClick={locateMe}>
              <LocateFixed />
              {locationState === 'locating' ? t('locating') : t('useLocation')}
            </Button>
            {location ? <Alert tone="success">{t('locationReady')}</Alert> : null}
            {locationState === 'denied' ? (
              <Alert tone="warning">{t('locationDenied')}</Alert>
            ) : null}

            <Button type="submit" size="lg" disabled={busy || (!poleInput.trim() && !location)}>
              {tCommon('continue')}
            </Button>
          </form>
        ) : null}

        {step === 2 ? (
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (category) {
                setStep(3);
              }
            }}
          >
            <fieldset>
              <legend className="mb-3 text-sm font-medium">{t('problemLabel')}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {COMPLAINT_CATEGORIES.map((value) => {
                  const Icon = CATEGORY_ICONS[value];
                  const selected = category === value;
                  return (
                    <label
                      key={value}
                      className={cn(
                        'flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 font-medium transition-colors',
                        'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ring',
                        selected
                          ? 'border-primary bg-primary-subtle text-primary'
                          : 'border-border hover:bg-surface-subtle',
                      )}
                    >
                      <input
                        type="radio"
                        name="category"
                        value={value}
                        checked={selected}
                        onChange={() => setCategory(value)}
                        className="sr-only"
                      />
                      <Icon aria-hidden="true" className="size-5 shrink-0" />
                      {tCategory(value)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <Field label={t('descriptionLabel')} hint={t('descriptionHint')}>
              {({ id, describedBy }) => (
                <Textarea
                  id={id}
                  aria-describedby={describedBy}
                  maxLength={500}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              )}
            </Field>
            <Field label={t('nameLabel')}>
              {({ id }) => (
                <Input
                  id={id}
                  autoComplete="name"
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)}>
                {tCommon('back')}
              </Button>
              <Button type="submit" size="lg" disabled={!category}>
                {tCommon('continue')}
              </Button>
            </div>
          </form>
        ) : null}

        {step === 3 ? (
          !needsOtp ? (
            <div className="grid gap-4">
              <div className="rounded-xl bg-surface-subtle p-4 text-sm">
                <p className="font-semibold">{category ? tCategory(category) : ''}</p>
                <p className="mt-1 font-mono text-muted-foreground">
                  {poleInput || t('locationReady')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" variant="outline" size="lg" onClick={() => setStep(2)}>
                  {tCommon('back')}
                </Button>
                <Button size="lg" disabled={busy} onClick={() => void submit()}>
                  {busy ? t('submitting') : t('submit')}
                </Button>
              </div>
            </div>
          ) : !otpSent ? (
            <form className="grid gap-4" onSubmit={sendCode} noValidate>
              <Field label={t('phoneLabel')} hint={t('phoneHint')} required>
                {({ id, describedBy }) => (
                  <div className="flex">
                    <span className="grid place-items-center rounded-l-lg border border-r-0 border-border bg-surface-subtle px-3 font-medium text-muted-foreground">
                      +91
                    </span>
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      className="rounded-l-none text-lg tracking-wider"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={10}
                      value={phoneDigits}
                      onChange={(event) =>
                        setPhoneDigits(event.target.value.replace(/\D/g, '').slice(0, 10))
                      }
                    />
                  </div>
                )}
              </Field>
              <Button type="submit" size="lg" disabled={!phoneValid || busy}>
                {busy ? t('sending') : t('sendCode')}
              </Button>
            </form>
          ) : (
            <form className="grid gap-4" onSubmit={verifyAndSubmit} noValidate>
              <Field
                label={t('codeLabel')}
                hint={t('codeHint', { phone: `+91 ${phoneDigits}` })}
                required
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    className="text-center font-mono text-2xl tracking-[0.5em]"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                )}
              </Field>
              <Button type="submit" size="lg" disabled={code.length !== 6 || busy}>
                {busy ? t('submitting') : t('verifyAndSubmit')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setOtpSent(false);
                  setCode('');
                }}
              >
                {t('changeNumber')}
              </Button>
            </form>
          )
        ) : null}
      </Card>
    </div>
  );
}
