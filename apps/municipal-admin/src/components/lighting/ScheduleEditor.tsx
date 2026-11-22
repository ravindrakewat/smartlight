'use client';

import {
  ApiClientError,
  SCHEDULE_MAX_STEPS,
  SOLAR_OFFSET_LIMIT_MINUTES,
  type ScheduleDto,
  type ScheduleStep,
} from '@smart-light/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
} from '@smart-light/ui';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

/** A sensible starting point for Indian streets: dusk to dawn with late-night dimming. */
export const STARTER_STEPS: ScheduleStep[] = [
  { anchor: 'sunset', offsetMinutes: 10, on: true, dimPercent: 100 },
  { anchor: 'clock', atMinute: 23 * 60 + 30, on: true, dimPercent: 60 },
  { anchor: 'clock', atMinute: 4 * 60 + 30, on: true, dimPercent: 100 },
  { anchor: 'sunrise', offsetMinutes: -10, on: false, dimPercent: 0 },
];

const toTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const fromTime = (value: string) => {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Math.min(1439, Number(hours) * 60 + Number(minutes));
};

/** Human description of one step, e.g. "10 min after sunset · On at 100 %". */
export function useStepLabel(): (step: ScheduleStep) => string {
  const t = useTranslations('Lighting.schedules.step');
  return (step) => {
    const when =
      step.anchor === 'clock'
        ? toTime(step.atMinute)
        : step.offsetMinutes === 0
          ? t(`at.${step.anchor}`)
          : t(step.offsetMinutes > 0 ? `after.${step.anchor}` : `before.${step.anchor}`, {
              minutes: Math.abs(step.offsetMinutes),
            });
    return `${when} · ${step.on ? t('onAt', { value: step.dimPercent }) : t('off')}`;
  };
}

export function ScheduleEditor({
  schedule,
  onSaved,
  onCancel,
}: {
  schedule: ScheduleDto | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('Lighting.schedules.editor');
  const tStep = useTranslations('Lighting.schedules.step');
  const [name, setName] = useState(schedule?.name ?? '');
  const [isDefault, setIsDefault] = useState(schedule?.isDefault ?? false);
  const [steps, setSteps] = useState<ScheduleStep[]>(schedule?.steps ?? STARTER_STEPS);

  const save = useMutation({
    mutationFn: () =>
      api.request<ScheduleDto>(schedule ? `/v1/schedules/${schedule.id}` : '/v1/schedules', {
        method: schedule ? 'PUT' : 'POST',
        body: { name: name.trim(), isDefault, steps },
      }),
    onSuccess: onSaved,
  });

  const errorKey =
    save.error instanceof ApiClientError && save.error.code === 'CONFLICT'
      ? 'exists'
      : save.error instanceof ApiClientError && save.error.code === 'VALIDATION_ERROR'
        ? 'invalid'
        : 'generic';

  const updateStep = (index: number, next: ScheduleStep) =>
    setSteps((current) => current.map((step, position) => (position === index ? next : step)));

  function changeAnchor(index: number, anchor: ScheduleStep['anchor']) {
    const step = steps[index]!;
    const base = { on: step.on, dimPercent: step.dimPercent };
    updateStep(
      index,
      anchor === 'clock'
        ? { anchor, atMinute: 18 * 60, ...base }
        : { anchor, offsetMinutes: 0, ...base },
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{schedule ? t('editTitle', { name: schedule.name }) : t('newTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={onSubmit}>
          {save.error ? <Alert tone="danger">{t(`errors.${errorKey}`)}</Alert> : null}
          <Field label={t('name')} required>
            {({ id }) => (
              <Input
                id={id}
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
            />
            {t('isDefault')}
          </label>

          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-semibold">{t('steps')}</legend>
            {steps.map((step, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
              >
                <Field label={tStep('when')}>
                  {({ id }) => (
                    <Select
                      id={id}
                      value={step.anchor}
                      onChange={(event) =>
                        changeAnchor(index, event.target.value as ScheduleStep['anchor'])
                      }
                    >
                      <option value="clock">{tStep('anchors.clock')}</option>
                      <option value="sunset">{tStep('anchors.sunset')}</option>
                      <option value="sunrise">{tStep('anchors.sunrise')}</option>
                    </Select>
                  )}
                </Field>
                {step.anchor === 'clock' ? (
                  <Field label={tStep('time')}>
                    {({ id }) => (
                      <Input
                        id={id}
                        type="time"
                        required
                        value={toTime(step.atMinute)}
                        onChange={(event) =>
                          updateStep(index, { ...step, atMinute: fromTime(event.target.value) })
                        }
                      />
                    )}
                  </Field>
                ) : (
                  <Field label={tStep('offset')} hint={tStep('offsetHint')}>
                    {({ id, describedBy }) => (
                      <Input
                        id={id}
                        type="number"
                        aria-describedby={describedBy}
                        min={-SOLAR_OFFSET_LIMIT_MINUTES}
                        max={SOLAR_OFFSET_LIMIT_MINUTES}
                        step={5}
                        value={step.offsetMinutes}
                        onChange={(event) =>
                          updateStep(index, { ...step, offsetMinutes: Number(event.target.value) })
                        }
                      />
                    )}
                  </Field>
                )}
                <Field label={tStep('light')}>
                  {({ id }) => (
                    <Select
                      id={id}
                      value={step.on ? String(step.dimPercent) : 'off'}
                      onChange={(event) =>
                        updateStep(
                          index,
                          event.target.value === 'off'
                            ? { ...step, on: false, dimPercent: 0 }
                            : { ...step, on: true, dimPercent: Number(event.target.value) },
                        )
                      }
                    >
                      {[100, 80, 60, 50, 40, 30].map((level) => (
                        <option key={level} value={level}>
                          {tStep('onAt', { value: level })}
                        </option>
                      ))}
                      <option value="off">{tStep('off')}</option>
                    </Select>
                  )}
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={steps.length <= 1}
                  aria-label={tStep('remove', { number: index + 1 })}
                  onClick={() =>
                    setSteps((current) => current.filter((_, position) => position !== index))
                  }
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              className="w-fit"
              disabled={steps.length >= SCHEDULE_MAX_STEPS}
              onClick={() =>
                setSteps((current) => [
                  ...current,
                  { anchor: 'clock', atMinute: 0, on: true, dimPercent: 100 },
                ])
              }
            >
              <Plus aria-hidden="true" />
              {tStep('add')}
            </Button>
          </fieldset>

          <p className="text-xs text-muted-foreground">{t('hint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={save.isPending}>
              {t('save')}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
