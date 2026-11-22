'use client';

import {
  ApiClientError,
  type ControlResultDto,
  type LightingCommandRequest,
} from '@smart-light/shared';
import { Alert, Button, Field, Select } from '@smart-light/ui';
import { useMutation } from '@tanstack/react-query';
import { Lightbulb, LightbulbOff, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api } from '@/lib/api';

/** Override durations offered to operators, in minutes. */
export const DURATIONS = [30, 60, 120, 240, 480, 720, 1440] as const;
export const DIM_LEVELS = [100, 70, 50, 30] as const;

/**
 * Switch a pole, a zone or the whole city: on (with brightness) or off for a
 * while, or back to the schedule. The controller returns to its schedule by
 * itself when the time is up.
 */
export function ControlPanel({
  target,
  onSent,
}: {
  target: LightingCommandRequest['target'];
  onSent?: (result: ControlResultDto) => void;
}) {
  const t = useTranslations('Lighting.control');
  const [duration, setDuration] = useState<number>(120);
  const [dim, setDim] = useState<number>(100);
  const [result, setResult] = useState<ControlResultDto | null>(null);

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

  const errorKey =
    send.error instanceof ApiClientError && send.error.code === 'FORBIDDEN'
      ? 'forbidden'
      : 'failed';

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('brightness')}>
          {({ id }) => (
            <Select id={id} value={dim} onChange={(event) => setDim(Number(event.target.value))}>
              {DIM_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {t('percent', { value: level })}
                </option>
              ))}
            </Select>
          )}
        </Field>
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
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={send.isPending}
          onClick={() => send.mutate({ action: 'on', dimPercent: dim, durationMinutes: duration })}
        >
          <Lightbulb aria-hidden="true" />
          {t('on')}
        </Button>
        <Button
          variant="secondary"
          disabled={send.isPending}
          onClick={() => send.mutate({ action: 'off', durationMinutes: duration })}
        >
          <LightbulbOff aria-hidden="true" />
          {t('off')}
        </Button>
        <Button
          variant="ghost"
          disabled={send.isPending}
          onClick={() => send.mutate({ action: 'auto' })}
        >
          <RotateCcw aria-hidden="true" />
          {t('auto')}
        </Button>
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
