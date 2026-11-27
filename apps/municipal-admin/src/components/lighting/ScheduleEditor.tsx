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
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
} from '@smart-light/ui';
import { useMutation } from '@tanstack/react-query';
import { CalendarClock, Layers, Plus, Save, Trash2, Wand2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { AnchorIcon, OutputIcon, fromTime, toTime } from './schedule-visuals';

/** A sensible starting point for Indian streets: dusk to dawn with late-night dimming. */
export const STARTER_STEPS: ScheduleStep[] = [
  { anchor: 'sunset', offsetMinutes: 10, on: true, dimPercent: 100 },
  { anchor: 'clock', atMinute: 23 * 60 + 30, on: true, dimPercent: 60 },
  { anchor: 'clock', atMinute: 4 * 60 + 30, on: true, dimPercent: 100 },
  { anchor: 'sunrise', offsetMinutes: -10, on: false, dimPercent: 0 },
];

/** Ready-made plans an admin can start from; every one can be edited before saving. */
const TEMPLATES = {
  nightDimming: STARTER_STEPS,
  duskToDawn: [
    { anchor: 'sunset', offsetMinutes: 0, on: true, dimPercent: 100 },
    { anchor: 'sunrise', offsetMinutes: 0, on: false, dimPercent: 0 },
  ],
  energySaver: [
    { anchor: 'sunset', offsetMinutes: 10, on: true, dimPercent: 100 },
    { anchor: 'clock', atMinute: 22 * 60, on: true, dimPercent: 70 },
    { anchor: 'clock', atMinute: 0, on: true, dimPercent: 50 },
    { anchor: 'clock', atMinute: 5 * 60, on: true, dimPercent: 100 },
    { anchor: 'sunrise', offsetMinutes: -10, on: false, dimPercent: 0 },
  ],
  parks: [
    { anchor: 'sunset', offsetMinutes: 0, on: true, dimPercent: 100 },
    { anchor: 'clock', atMinute: 0, on: false, dimPercent: 0 },
  ],
} satisfies Record<string, ScheduleStep[]>;
type TemplateName = keyof typeof TEMPLATES;
const TEMPLATE_NAMES = Object.keys(TEMPLATES) as TemplateName[];

const LEVELS = [100, 80, 70, 60, 50, 40, 30] as const;

/** When a step runs, e.g. "10 min after sunset" or "23:30". */
export function useWhenLabel(): (step: ScheduleStep) => string {
  const t = useTranslations('Lighting.schedules.step');
  return (step) => {
    if (step.anchor === 'clock') return toTime(step.atMinute);
    if (step.offsetMinutes === 0) return t(`at.${step.anchor}`);
    return t(step.offsetMinutes > 0 ? `after.${step.anchor}` : `before.${step.anchor}`, {
      minutes: Math.abs(step.offsetMinutes),
    });
  };
}

/** What the light does in a step, e.g. "On at 60 %" or "Off". */
export function useOutputLabel(): (step: ScheduleStep) => string {
  const t = useTranslations('Lighting.schedules.step');
  return (step) => (step.on ? t('onAt', { value: step.dimPercent }) : t('off'));
}

/** Human description of one step, e.g. "10 min after sunset · On at 100 %". */
export function useStepLabel(): (step: ScheduleStep) => string {
  const when = useWhenLabel();
  const output = useOutputLabel();
  return (step) => `${when(step)} · ${output(step)}`;
}

export function ScheduleEditor({
  schedule,
  onSaved,
  onCancel,
}: {
  schedule: ScheduleDto | null;
  onSaved: (saved: ScheduleDto) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('Lighting.schedules.editor');
  const tStep = useTranslations('Lighting.schedules.step');
  const stepLabel = useStepLabel();
  const switchId = useId();
  const [name, setName] = useState(schedule?.name ?? '');
  const [isDefault, setIsDefault] = useState(schedule?.isDefault ?? false);
  const [steps, setSteps] = useState<ScheduleStep[]>(schedule?.steps ?? STARTER_STEPS);
  const [template, setTemplate] = useState<TemplateName | ''>('');

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

  function applyTemplate(value: TemplateName | '') {
    setTemplate(value);
    if (value) setSteps(TEMPLATES[value].map((step) => ({ ...step })));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <Card className="border-primary/30 shadow-md">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-subtle text-primary [&_svg]:size-6"
            >
              <CalendarClock />
            </span>
            <div className="min-w-0">
              <CardTitle>
                {schedule ? t('editTitle', { name: schedule.name }) : t('newTitle')}
              </CardTitle>
              <CardDescription>{t('subtitle')}</CardDescription>
            </div>
          </div>
          <Field label={t('templates.label')} className="w-full sm:w-60">
            {({ id }) => (
              <div className="relative">
                <Wand2
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-primary"
                />
                <Select
                  id={id}
                  className="pl-9"
                  value={template}
                  onChange={(event) => applyTemplate(event.target.value as TemplateName | '')}
                >
                  <option value="">{t('templates.choose')}</option>
                  {TEMPLATE_NAMES.map((key) => (
                    <option key={key} value={key}>
                      {t(`templates.${key}`)}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </Field>
        </div>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5 [&>*]:min-w-0" onSubmit={onSubmit} aria-busy={save.isPending}>
          {save.error ? <Alert tone="danger">{t(`errors.${errorKey}`)}</Alert> : null}
          {template ? (
            <Alert tone="info">
              {t('templates.applied', { name: t(`templates.${template}`) })}
            </Alert>
          ) : null}

          <Field label={t('name')} required>
            {({ id }) => (
              <Input
                id={id}
                required
                minLength={2}
                maxLength={80}
                placeholder={t('namePlaceholder')}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>

          <label
            htmlFor={switchId}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-surface-subtle/70 px-3 py-2 text-sm"
          >
            <input
              id={switchId}
              type="checkbox"
              role="switch"
              className="peer sr-only"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
            />
            <span
              aria-hidden="true"
              className="relative h-6 w-11 shrink-0 rounded-full bg-muted-foreground/40 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-surface after:shadow-sm after:transition-transform peer-checked:after:translate-x-5 motion-reduce:transition-none motion-reduce:after:transition-none"
            />
            <span className="font-medium">{t('isDefault')}</span>
          </label>

          <fieldset className="grid min-w-0 gap-4 rounded-2xl border border-border bg-surface-subtle/40 p-3 sm:p-4">
            <legend className="sr-only">{t('steps')}</legend>
            <div className="flex items-start gap-3" aria-hidden="true">
              <Layers className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold">{t('steps')}</p>
                <p className="text-sm text-muted-foreground">{t('stepsHint')}</p>
              </div>
            </div>

            <ol className="grid gap-3">
              {steps.map((step, index) => (
                <li
                  key={index}
                  className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-2 sm:gap-3"
                >
                  <span
                    aria-hidden="true"
                    className="z-10 mt-3 grid size-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                  >
                    {index + 1}
                  </span>
                  {index < steps.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-11 -bottom-3 left-4 w-px bg-primary/30"
                    />
                  ) : null}
                  <div className="grid min-w-0 gap-3 rounded-xl border border-border bg-surface p-3 shadow-xs [&>*]:min-w-0">
                    <div className="flex items-center gap-3">
                      <AnchorIcon anchor={step.anchor} />
                      <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold">
                        <span className="sr-only">{tStep('number', { number: index + 1 })}</span>
                        <span className="truncate">{stepLabel(step)}</span>
                        <OutputIcon step={step} />
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-danger hover:bg-danger-subtle"
                        disabled={steps.length <= 1}
                        aria-label={tStep('remove', { number: index + 1 })}
                        onClick={() =>
                          setSteps((current) => current.filter((_, position) => position !== index))
                        }
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                      <Field label={tStep('when')}>
                        {({ id }) => (
                          <Select
                            id={id}
                            value={step.anchor}
                            onChange={(event) =>
                              changeAnchor(index, event.target.value as ScheduleStep['anchor'])
                            }
                          >
                            <option value="sunset">{tStep('anchors.sunset')}</option>
                            <option value="sunrise">{tStep('anchors.sunrise')}</option>
                            <option value="clock">{tStep('anchors.clock')}</option>
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
                                updateStep(index, {
                                  ...step,
                                  atMinute: fromTime(event.target.value),
                                })
                              }
                            />
                          )}
                        </Field>
                      ) : (
                        <>
                          <Field label={tStep('offset')}>
                            {({ id }) => (
                              <Input
                                id={id}
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={SOLAR_OFFSET_LIMIT_MINUTES}
                                step={5}
                                value={Math.abs(step.offsetMinutes)}
                                onChange={(event) => {
                                  const minutes = Math.min(
                                    SOLAR_OFFSET_LIMIT_MINUTES,
                                    Math.max(0, Math.round(Number(event.target.value) || 0)),
                                  );
                                  updateStep(index, {
                                    ...step,
                                    offsetMinutes: step.offsetMinutes < 0 ? -minutes : minutes,
                                  });
                                }}
                              />
                            )}
                          </Field>
                          <Field label={tStep('direction')}>
                            {({ id }) => (
                              <Select
                                id={id}
                                value={step.offsetMinutes < 0 ? 'before' : 'after'}
                                onChange={(event) =>
                                  updateStep(index, {
                                    ...step,
                                    offsetMinutes:
                                      Math.abs(step.offsetMinutes) *
                                      (event.target.value === 'before' ? -1 : 1),
                                  })
                                }
                              >
                                <option value="before">{tStep('beforeShort')}</option>
                                <option value="after">{tStep('afterShort')}</option>
                              </Select>
                            )}
                          </Field>
                        </>
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
                            {LEVELS.map((level) => (
                              <option key={level} value={level}>
                                {tStep('onAt', { value: level })}
                              </option>
                            ))}
                            {step.on &&
                            !LEVELS.includes(step.dimPercent as (typeof LEVELS)[number]) ? (
                              <option value={step.dimPercent}>
                                {tStep('onAt', { value: step.dimPercent })}
                              </option>
                            ) : null}
                            <option value="off">{tStep('off')}</option>
                          </Select>
                        )}
                      </Field>
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            <p className="text-xs text-muted-foreground">{t('hint')}</p>
          </fieldset>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="border-primary text-primary"
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
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Button type="button" variant="ghost" onClick={onCancel} disabled={save.isPending}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                <Save aria-hidden="true" />
                {save.isPending ? t('saving') : t('save')}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
