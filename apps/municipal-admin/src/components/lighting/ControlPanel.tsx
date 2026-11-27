'use client';

import {
  ApiClientError,
  type ControlResultDto,
  type LightingCommandRequest,
} from '@smart-light/shared';
import { Alert, Button, Field, Select, Spinner, cn } from '@smart-light/ui';
import { useMutation } from '@tanstack/react-query';
import { Lightbulb, LightbulbOff, RotateCcw, SunDim } from 'lucide-react';
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
}: {
  target: LightingCommandRequest['target'];
  onSent?: (result: ControlResultDto) => void;
  /** `tiles`: large two-column action tiles (Lighting & schedules page). */
  layout?: 'buttons' | 'tiles';
  /** Asked before a command is sent; return false to cancel. */
  confirm?: (action: LightingCommandRequest['control']['action']) => boolean;
}) {
  const t = useTranslations('Lighting.control');
  const [duration, setDuration] = useState<number>(120);
  const [dim, setDim] = useState<number>(100);
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

  const errorKey =
    send.error instanceof ApiClientError && send.error.code === 'FORBIDDEN'
      ? 'forbidden'
      : 'failed';

  return (
    <div className="grid gap-4">
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
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={send.isPending}
            onClick={() => run({ action: 'on', dimPercent: dim, durationMinutes: duration })}
          >
            <Lightbulb aria-hidden="true" />
            {t('on')}
          </Button>
          <Button
            variant="secondary"
            disabled={send.isPending}
            onClick={() => run({ action: 'off', durationMinutes: duration })}
          >
            <LightbulbOff aria-hidden="true" />
            {t('off')}
          </Button>
          <Button variant="ghost" disabled={send.isPending} onClick={() => run({ action: 'auto' })}>
            <RotateCcw aria-hidden="true" />
            {t('auto')}
          </Button>
        </div>
      )}
      {send.isPending ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          {t('sending')}
        </p>
      ) : null}
      <div className="grid gap-2 rounded-lg bg-surface-subtle/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={sliderId} className="text-sm font-medium">
            {t('brightness')}
          </label>
          <output htmlFor={sliderId} className="text-sm font-semibold tabular-nums">
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
        {singlePole ? (
          <p className="text-xs text-muted-foreground">{t('sliderLive')}</p>
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
