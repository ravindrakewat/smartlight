'use client';

import {
  ApiClientError,
  type ControlResultDto,
  type LightingCommandRequest,
} from '@smart-light/shared';
import { Alert, Button, Field, Select, Spinner, cn } from '@smart-light/ui';
import { useMutation } from '@tanstack/react-query';
import {
  Check,
  Info,
  Lightbulb,
  LightbulbOff,
  RotateCcw,
  Sun,
  SunDim,
  WifiOff,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';

/** Override durations offered to operators, in minutes. */
export const DURATIONS = [30, 60, 120, 240, 480, 720, 1440] as const;
/** Brightness slider range; controllers accept 10–100 % (below 10 % LED drivers flicker). */
const DIM_MIN = 10;
const DIM_STEP = 5;
/** Wait this long after the last slider movement before sending (one command per adjustment). */
const SLIDER_SETTLE_MS = 600;

/**
 * Switch a pole, a zone or the whole city: on (with brightness) or off for a
 * while, or back to the schedule. The controller returns to its schedule by
 * itself when the time is up.
 */
export function ControlPanel({
  target,
  onSent,
  layout = 'buttons',
  confirm,
  reported,
}: {
  target: LightingCommandRequest['target'];
  onSent?: (result: ControlResultDto) => void;
  /** `tiles`: large two-column action tiles (Lighting & schedules page). */
  layout?: 'buttons' | 'tiles';
  /** Asked before a command is sent; return false to cancel. */
  confirm?: (action: LightingCommandRequest['control']['action']) => boolean;
  /** Last state the pole's controller reported (pole page only). */
  reported?: {
    online: boolean;
    lampOn: boolean | null;
    dimPercent: number | null;
    mode?: string | null;
  };
}) {
  const reportedMode = reported?.mode ?? null;
  const t = useTranslations('Lighting.control');
  const [duration, setDuration] = useState<number>(120);
  // Start the slider where the lamp is now, so a small nudge does not jump to 100 %.
  const [dim, setDim] = useState<number>(() =>
    reported?.lampOn && reported.dimPercent
      ? Math.min(100, Math.max(DIM_MIN, Math.round(reported.dimPercent / DIM_STEP) * DIM_STEP))
      : 100,
  );
  const [result, setResult] = useState<ControlResultDto | null>(null);
  const sliderId = useId();
  // One pole: the slider switches the light itself, once the operator stops moving it.
  // A zone or the whole city keeps an explicit button so one drag cannot flood thousands
  // of controllers with commands.
  const singlePole = target.type === 'pole';
  const sendTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(sendTimer.current), []);

  const send = useMutation({
    mutationFn: (control: LightingCommandRequest['control']) =>
      api.request<ControlResultDto>('/v1/lighting/commands', {
        method: 'POST',
        body: { target, control },
      }),
    onSuccess: (data) => {
      setResult(data);
      onSent?.(data);
    },
  });

  const run = (control: LightingCommandRequest['control']) => {
    if (confirm && !confirm(control.action)) return;
    send.mutate(control);
  };

  const changeDim = (value: number) => {
    setDim(value);
    if (!singlePole) return;
    clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(
      () => send.mutate({ action: 'on', dimPercent: value, durationMinutes: duration }),
      SLIDER_SETTLE_MS,
    );
  };

  // Which choice is highlighted: the command being sent or last sent from this panel;
  // before any, what the controller reports (manual on/off, otherwise on schedule).
  const lastAction = send.isError ? undefined : send.variables?.action;
  const selected: 'on' | 'off' | 'auto' | null =
    lastAction ??
    (reported?.lampOn === null || !reported
      ? null
      : reportedMode === 'manual'
        ? reported.lampOn
          ? 'on'
          : 'off'
        : 'auto');

  const errorKey =
    send.error instanceof ApiClientError && send.error.code === 'FORBIDDEN'
      ? 'forbidden'
      : 'failed';

  return (
    <div className="grid gap-4">
      {reported && !reported.online ? (
        <Alert tone="warning" icon={<WifiOff aria-hidden="true" />}>
          {t('offlineNote')}
        </Alert>
      ) : null}
      <Field label={t('duration')}>
        {({ id }) => (
          <Select
            id={id}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
          >
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes < 60
                  ? t('minutes', { count: minutes })
                  : t('hours', { count: minutes / 60 })}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {layout === 'tiles' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <ActionTile
            variant="primary"
            icon={<Lightbulb />}
            label={t('on')}
            detail={t('tileOn', { value: dim })}
            disabled={send.isPending}
            onClick={() => run({ action: 'on', dimPercent: dim, durationMinutes: duration })}
          />
          <ActionTile
            variant="secondary"
            icon={<LightbulbOff />}
            label={t('off')}
            detail={t('tileOff')}
            disabled={send.isPending}
            onClick={() => run({ action: 'off', durationMinutes: duration })}
          />
          <ActionTile
            variant="outline"
            className="sm:col-span-2 xl:col-span-1"
            icon={<RotateCcw />}
            label={t('auto')}
            detail={t('tileAuto')}
            disabled={send.isPending}
            onClick={() => run({ action: 'auto' })}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <ChoiceButton
            selected={selected === 'on'}
            sending={send.isPending && send.variables?.action === 'on'}
            disabled={send.isPending}
            icon={<Lightbulb />}
            label={t('on')}
            selectedLabel={t('selected')}
            onClick={() => run({ action: 'on', dimPercent: dim, durationMinutes: duration })}
          />
          <ChoiceButton
            selected={selected === 'off'}
            sending={send.isPending && send.variables?.action === 'off'}
            disabled={send.isPending}
            icon={<LightbulbOff />}
            label={t('off')}
            selectedLabel={t('selected')}
            onClick={() => run({ action: 'off', durationMinutes: duration })}
          />
          <ChoiceButton
            compact
            className="col-span-2"
            selected={selected === 'auto'}
            sending={send.isPending && send.variables?.action === 'auto'}
            disabled={send.isPending}
            icon={<RotateCcw />}
            label={t('auto')}
            selectedLabel={t('selected')}
            onClick={() => run({ action: 'auto' })}
          />
        </div>
      )}
      {send.isPending ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          {t('sending')}
        </p>
      ) : null}
      <div className="grid gap-2 rounded-xl border border-border bg-surface-subtle/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={sliderId} className="flex items-center gap-2 text-sm font-semibold">
            <Sun aria-hidden="true" className="size-4 text-warning" />
            {t('brightness')}
          </label>
          <output
            htmlFor={sliderId}
            aria-live="polite"
            className="text-2xl font-bold text-primary tabular-nums"
          >
            {t('percent', { value: dim })}
          </output>
        </div>
        <input
          id={sliderId}
          type="range"
          min={DIM_MIN}
          max={100}
          step={DIM_STEP}
          value={dim}
          onChange={(event) => changeDim(Number(event.target.value))}
          className="h-11 w-full cursor-pointer accent-primary"
        />
        <div aria-hidden="true" className="flex justify-between text-xs text-muted-foreground">
          <span>{t('percent', { value: DIM_MIN })}</span>
          <span>{t('percent', { value: 50 })}</span>
          <span>{t('percent', { value: 100 })}</span>
        </div>
        {reported ? (
          <p className="text-sm">
            <span className="text-muted-foreground">{t('reported')}</span>{' '}
            <span className="font-semibold">
              {reported.lampOn === null
                ? t('reportedUnknown')
                : reported.lampOn
                  ? t('percent', { value: reported.dimPercent ?? 100 })
                  : t('reportedOff')}
            </span>
          </p>
        ) : null}
        {singlePole ? (
          <>
            <p className="text-xs text-muted-foreground">{t('sliderLive')}</p>
            <p className="flex gap-2 rounded-lg bg-info-subtle p-2 text-xs text-info">
              <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {t('dimmingNote')}
            </p>
          </>
        ) : (
          <Button
            variant="secondary"
            disabled={send.isPending}
            onClick={() => run({ action: 'on', dimPercent: dim, durationMinutes: duration })}
            className="justify-self-start"
          >
            <SunDim aria-hidden="true" />
            {t('setBrightness', { value: dim })}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
      {send.error ? <Alert tone="danger">{t(`errors.${errorKey}`)}</Alert> : null}
      {result && !send.isPending ? (
        <Alert tone={result.queued > 0 ? 'success' : 'warning'}>
          {result.queued > 0
            ? t('queued', { count: result.queued, skipped: result.withoutController })
            : t('noControllers')}
        </Alert>
      ) : null}
    </div>
  );
}

/** Large action button with an icon circle and a one-line explanation. */
function ActionTile({
  icon,
  label,
  detail,
  variant,
  className,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  variant: 'primary' | 'secondary' | 'outline';
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={variant}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-auto min-h-16 justify-start gap-3 rounded-xl px-3 py-3 text-left whitespace-normal',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-full [&_svg]:size-5',
          variant === 'primary' ? 'bg-primary-foreground/15' : 'bg-surface shadow-xs',
        )}
      >
        {icon}
      </span>
      <span className="grid min-w-0">
        <span className="font-semibold">{label}</span>
        <span className="text-xs font-normal opacity-80">{detail}</span>
      </span>
    </Button>
  );
}

/**
 * On / off / back-to-schedule choice. The selected one is filled and shows a tick and
 * the word "Selected", so the choice never depends on colour alone.
 */
function ChoiceButton({
  selected,
  sending,
  disabled,
  icon,
  label,
  selectedLabel,
  compact,
  className,
  onClick,
}: {
  selected: boolean;
  sending: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  selectedLabel: string;
  compact?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <Button
      size={compact ? 'md' : 'lg'}
      variant={selected ? 'primary' : 'outline'}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative rounded-xl',
        compact ? 'h-12' : 'h-14',
        selected
          ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface'
          : 'border-primary/40 text-primary hover:bg-primary-subtle',
        className,
      )}
    >
      {sending ? <Spinner className="size-5" /> : <span aria-hidden="true">{icon}</span>}
      {label}
      {selected && !sending ? (
        <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-success text-primary-foreground shadow-sm ring-2 ring-surface">
          <Check aria-hidden="true" className="size-3.5" />
          <span className="sr-only">{selectedLabel}</span>
        </span>
      ) : null}
    </Button>
  );
}
