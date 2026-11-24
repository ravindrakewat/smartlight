'use client';

import { Check, Copy, Download, KeyRound, Laptop, ShieldCheck, Smartphone } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Badge } from './Badge';
import { Button } from './Button';
import { Alert, Spinner } from './Feedback';
import { Field, Input } from './Form';

/**
 * QR code as one SVG path. Always dark on white, in both themes: authenticator
 * apps cannot read an inverted code.
 */
export function QrCodeSvg({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          d += `M${col + 4} ${row + 4}h1v1h-1z`;
        }
      }
    }
    return { size: count + 8, path: d };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={size} height={size} className="fill-white" />
      <path d={path} className="fill-black" />
    </svg>
  );
}

// ─── One code field ──────────────────────────────────────────────────────────

export interface CodeFormLabels {
  code: string;
  codeHint: string;
  submit: string;
  submitting: string;
}

/** A 6-digit authenticator code (or a recovery code); the API checks it. */
export function CodeForm({
  labels,
  onSubmit,
  error,
  children,
}: {
  labels: CodeFormLabels;
  onSubmit: (code: string) => Promise<void>;
  error?: string | null;
  children?: ReactNode;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit(code.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)} noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {children}
      <Field label={labels.code} hint={labels.codeHint} required>
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            autoComplete="one-time-code"
            inputMode="text"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={12}
            required
            className="font-mono text-lg tracking-[0.3em]"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        )}
      </Field>
      <Button type="submit" size="lg" disabled={busy || code.trim().length < 6}>
        {busy ? labels.submitting : labels.submit}
      </Button>
    </form>
  );
}

// ─── Enrolment ───────────────────────────────────────────────────────────────

export interface EnrolLabels {
  steps: string;
  qrLabel: string;
  manual: string;
}

/** Scan-this QR, the secret for typing by hand, and the steps. */
export function EnrolPanel({
  labels,
  secret,
  otpauthUri,
}: {
  labels: EnrolLabels;
  secret: string;
  otpauthUri: string;
}) {
  const grouped = secret.match(/.{1,4}/g)?.join(' ') ?? secret;
  return (
    <div className="grid gap-4 sm:grid-cols-[11rem_1fr] sm:items-center">
      <QrCodeSvg
        value={otpauthUri}
        label={labels.qrLabel}
        className="mx-auto size-44 rounded-lg border border-border"
      />
      <div className="grid gap-2 text-sm">
        <p>{labels.steps}</p>
        <p className="text-muted-foreground">{labels.manual}</p>
        <code className="rounded-md bg-surface-subtle px-2 py-1.5 font-mono text-sm break-all select-all">
          {grouped}
        </code>
      </div>
    </div>
  );
}

// ─── Recovery codes ──────────────────────────────────────────────────────────

export interface RecoveryCodesLabels {
  title: string;
  body: string;
  copy: string;
  copied: string;
  download: string;
  fileName: string;
  confirm: string;
  continue: string;
}

/** Shows the recovery codes once; continue only after the person confirms saving them. */
export function RecoveryCodesPanel({
  labels,
  codes,
  onContinue,
}: {
  labels: RecoveryCodesLabels;
  codes: string[];
  onContinue: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');

  return (
    <div className="grid gap-4">
      <Alert tone="warning" title={labels.title}>
        {labels.body}
      </Alert>
      <ol className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-subtle p-4 font-mono text-base">
        {codes.map((code) => (
          <li key={code} className="tabular-nums select-all">
            {code}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => setCopied(true));
          }}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? labels.copied : labels.copy}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = labels.fileName;
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download aria-hidden="true" />
          {labels.download}
        </Button>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
        />
        {labels.confirm}
      </label>
      <Button type="button" size="lg" disabled={!saved} onClick={onContinue}>
        {labels.continue}
      </Button>
    </div>
  );
}

// ─── Settings card ───────────────────────────────────────────────────────────

export interface TwoFactorStatusValue {
  allowed: boolean;
  required: boolean;
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
}

export interface TwoFactorSettingsLabels {
  on: string;
  off: string;
  required: string;
  enabledSince: (date: string) => string;
  codesLeft: (count: number) => string;
  intro: string;
  turnOn: string;
  turnOff: string;
  turnOffHint: string;
  password: string;
  newCodes: string;
  newCodesHint: string;
  cancel: string;
  enrol: EnrolLabels;
  code: CodeFormLabels;
  recovery: RecoveryCodesLabels;
}

type SettingsStep = 'idle' | 'enrol' | 'disable' | 'regenerate' | 'codes';

/**
 * Two-factor section of a settings page. The app supplies translations and the
 * API calls; each call resolves to an error message, or null on success.
 */
export function TwoFactorSettings({
  status,
  labels,
  formatDate,
  onStartSetup,
  onEnable,
  onDisable,
  onRegenerate,
  onChanged,
}: {
  status: TwoFactorStatusValue;
  labels: TwoFactorSettingsLabels;
  formatDate: (iso: string) => string;
  onStartSetup: () => Promise<{ secret: string; otpauthUri: string } | string>;
  onEnable: (code: string) => Promise<string[] | string>;
  onDisable: (password: string, code: string) => Promise<string | null>;
  onRegenerate: (code: string) => Promise<string[] | string>;
  onChanged: () => void;
}) {
  const [step, setStep] = useState<SettingsStep>('idle');
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setError(null);
  }, [step]);

  const cancel = (
    <Button type="button" variant="ghost" onClick={() => setStep('idle')}>
      {labels.cancel}
    </Button>
  );

  if (step === 'codes') {
    return (
      <RecoveryCodesPanel
        labels={labels.recovery}
        codes={codes}
        onContinue={() => {
          setCodes([]);
          setStep('idle');
          onChanged();
        }}
      />
    );
  }

  if (step === 'enrol' && setup) {
    return (
      <div className="grid gap-4">
        <EnrolPanel labels={labels.enrol} secret={setup.secret} otpauthUri={setup.otpauthUri} />
        <CodeForm
          labels={labels.code}
          error={error}
          onSubmit={async (code) => {
            const result = await onEnable(code);
            if (typeof result === 'string') {
              setError(result);
              return;
            }
            setCodes(result);
            setStep('codes');
          }}
        />
        {cancel}
      </div>
    );
  }

  if (step === 'disable') {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">{labels.turnOffHint}</p>
        <CodeForm
          labels={labels.code}
          error={error}
          onSubmit={async (code) => {
            const failure = await onDisable(password, code);
            if (failure) {
              setError(failure);
              return;
            }
            setPassword('');
            setStep('idle');
            onChanged();
          }}
        >
          <Field label={labels.password} required>
            {({ id }) => (
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </Field>
        </CodeForm>
        {cancel}
      </div>
    );
  }

  if (step === 'regenerate') {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">{labels.newCodesHint}</p>
        <CodeForm
          labels={labels.code}
          error={error}
          onSubmit={async (code) => {
            const result = await onRegenerate(code);
            if (typeof result === 'string') {
              setError(result);
              return;
            }
            setCodes(result);
            setStep('codes');
          }}
        />
        {cancel}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status.enabled ? 'success' : 'warning'}>
          <ShieldCheck aria-hidden="true" className="mr-1 inline size-3.5" />
          {status.enabled ? labels.on : labels.off}
        </Badge>
        {status.required ? <Badge tone="info">{labels.required}</Badge> : null}
      </div>
      {status.enabled ? (
        <ul className="grid gap-1 text-sm text-muted-foreground">
          {status.enabledAt ? <li>{labels.enabledSince(formatDate(status.enabledAt))}</li> : null}
          <li className={cn(status.recoveryCodesLeft <= 3 && 'font-semibold text-warning')}>
            {labels.codesLeft(status.recoveryCodesLeft)}
          </li>
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{labels.intro}</p>
      )}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {!status.enabled ? (
          <Button
            type="button"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              void onStartSetup().then((result) => {
                setLoading(false);
                if (typeof result === 'string') {
                  setError(result);
                  return;
                }
                setSetup(result);
                setStep('enrol');
              });
            }}
          >
            {loading ? <Spinner /> : <KeyRound aria-hidden="true" />}
            {labels.turnOn}
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={() => setStep('regenerate')}>
              <KeyRound aria-hidden="true" />
              {labels.newCodes}
            </Button>
            {!status.required ? (
              <Button type="button" variant="ghost" onClick={() => setStep('disable')}>
                {labels.turnOff}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Signed-in devices ───────────────────────────────────────────────────────

export interface SessionRow {
  id: string;
  client: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  current: boolean;
}

export interface SessionsLabels {
  current: string;
  web: string;
  mobile: string;
  since: (date: string) => string;
  revokeOthers: string;
  revoked: (count: number) => string;
  none: string;
}

/** Short device name from a user-agent string, e.g. "Chrome on Windows". */
function deviceName(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null;
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad/.test(userAgent)
        ? 'iOS'
        : /Mac OS/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  return [browser, os].filter(Boolean).join(' · ') || null;
}

export function SessionsList({
  sessions,
  labels,
  formatDate,
  onRevokeOthers,
}: {
  sessions: SessionRow[];
  labels: SessionsLabels;
  formatDate: (iso: string) => string;
  onRevokeOthers: () => Promise<number>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const others = sessions.filter((session) => !session.current).length;

  return (
    <div className="grid gap-3">
      {message ? <Alert tone="success">{message}</Alert> : null}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {sessions.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">{labels.none}</li>
        ) : (
          sessions.map((session) => (
            <li key={session.id} className="flex items-center gap-3 p-3 text-sm">
              <span aria-hidden="true" className="text-muted-foreground [&_svg]:size-5">
                {session.client === 'mobile' ? <Smartphone /> : <Laptop />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {deviceName(session.userAgent) ??
                    (session.client === 'mobile' ? labels.mobile : labels.web)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {[labels.since(formatDate(session.createdAt)), session.ip]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              {session.current ? <Badge tone="success">{labels.current}</Badge> : null}
            </li>
          ))
        )}
      </ul>
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={busy || others === 0}
          onClick={() => {
            setBusy(true);
            void onRevokeOthers().then((count) => {
              setBusy(false);
              setMessage(labels.revoked(count));
            });
          }}
        >
          {labels.revokeOthers}
        </Button>
      </div>
    </div>
  );
}
