'use client';

import {
  compareScheduleSteps,
  type DashboardSummaryDto,
  type ScheduleDto,
} from '@smart-light/shared';
import { Badge, Button, Card, CardContent, Skeleton } from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDown,
  CalendarClock,
  CheckCircle2,
  Lightbulb,
  Pencil,
  Radio,
  Trash2,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useOutputLabel, useStepLabel, useWhenLabel } from './ScheduleEditor';
import { AnchorIcon, OutputIcon, nextStep } from './schedule-visuals';

/** Re-renders every minute so "next step" stays current. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function isInUse(schedule: ScheduleDto): boolean {
  return schedule.isDefault || schedule.zones.length > 0;
}

/** One saved schedule: who uses it, its steps as a small timeline, edit and delete. */
export function ScheduleCard({
  schedule,
  canEdit,
  deleting,
  onEdit,
  onDelete,
}: {
  schedule: ScheduleDto;
  canEdit: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('Lighting.schedules');
  const when = useWhenLabel();
  const output = useOutputLabel();
  const stepLabel = useStepLabel();
  const now = useMinuteClock();
  const steps = [...schedule.steps].sort(compareScheduleSteps);
  const upcoming = isInUse(schedule) ? nextStep(steps, now) : null;

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-subtle text-primary [&_svg]:size-5"
            >
              <CalendarClock />
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold break-words">{schedule.name}</h3>
              <p className="text-sm text-muted-foreground">
                {schedule.isDefault
                  ? t('usedByDefault')
                  : schedule.zones.length > 0
                    ? t('usedByZones', {
                        zones: schedule.zones.map((zone) => zone.code).join(', '),
                      })
                    : t('unused')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {schedule.isDefault ? <Badge tone="info">{t('default')}</Badge> : null}
            {isInUse(schedule) ? (
              <Badge tone="success">{t('active')}</Badge>
            ) : (
              <Badge tone="neutral">{t('inactive')}</Badge>
            )}
          </div>
        </div>

        <ol
          className="grid gap-2 sm:grid-cols-2"
          aria-label={t('stepsOf', { name: schedule.name })}
        >
          {steps.map((step, index) => (
            <li
              key={index}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface-subtle/50 px-3 py-2"
            >
              <AnchorIcon anchor={step.anchor} className="size-8" />
              <span className="grid min-w-0 text-sm">
                <span className="font-medium">{when(step)}</span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <OutputIcon step={step} className="size-3.5" />
                  {output(step)}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-sm text-muted-foreground">
            {upcoming ? (
              <>
                <span className="font-medium text-foreground">{t('next')}</span>{' '}
                {stepLabel(upcoming)}
              </>
            ) : (
              t('notRunning')
            )}
          </p>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button size="md" variant="outline" onClick={onEdit}>
                <Pencil aria-hidden="true" />
                {t('edit')}
                <span className="sr-only">{schedule.name}</span>
              </Button>
              {!schedule.isDefault ? (
                <Button
                  size="md"
                  variant="ghost"
                  className="text-danger hover:bg-danger-subtle"
                  disabled={deleting}
                  onClick={onDelete}
                >
                  <Trash2 aria-hidden="true" />
                  {t('delete')}
                  <span className="sr-only">{schedule.name}</span>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Dark summary card: the schedules controllers are following right now. */
export function ActiveSchedules({
  schedules,
  loading,
  listId,
}: {
  schedules: ScheduleDto[] | undefined;
  loading: boolean;
  listId: string;
}) {
  const t = useTranslations('Lighting.schedules.activePanel');
  const stepLabel = useStepLabel();
  const now = useMinuteClock();
  const active = (schedules ?? []).filter(isInUse);

  return (
    <section
      aria-labelledby="active-schedules-title"
      className="grid gap-4 rounded-2xl bg-night p-4 text-night-foreground shadow-lg sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="active-schedules-title" className="flex items-center gap-2 text-lg font-semibold">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-success" />
          {t('title')}
        </h2>
        <a
          href={`#${listId}`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-night-foreground/30 px-4 text-sm font-medium hover:bg-night-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-night-foreground"
        >
          {t('viewAll')}
          <ArrowDown aria-hidden="true" className="size-4" />
        </a>
      </div>

      {loading ? (
        <Skeleton className="h-20 bg-night-soft" />
      ) : active.length === 0 ? (
        <p className="rounded-xl bg-night-soft p-4 text-sm text-night-muted">{t('none')}</p>
      ) : (
        <ul className="grid gap-3">
          {active.map((schedule) => {
            const upcoming = nextStep(schedule.steps, now);
            return (
              <li
                key={schedule.id}
                className="flex items-center gap-3 rounded-xl bg-success-subtle p-3 text-foreground"
              >
                <CheckCircle2 aria-hidden="true" className="size-8 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold break-words">{schedule.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {schedule.isDefault
                      ? t('cityDefault')
                      : t('zones', { count: schedule.zones.length })}
                    {upcoming ? ` · ${t('next', { step: stepLabel(upcoming) })}` : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Live counts from the dashboard summary; shown only to roles that can read it. */
export function LightingStatus() {
  const t = useTranslations('Lighting.schedules.status');
  const format = useFormatter();
  const summary = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.request<DashboardSummaryDto>('/v1/dashboard/summary'),
    refetchInterval: 60_000,
  });

  if (summary.isError) return null;
  const data = summary.data;
  const tiles = [
    {
      key: 'controllers',
      icon: <Radio />,
      value: data
        ? t('ofTotal', {
            value: format.number(data.devices.online),
            total: format.number(data.devices.total),
          })
        : null,
    },
    { key: 'working', icon: <Lightbulb />, value: data ? format.number(data.poles.working) : null },
    {
      key: 'faults',
      icon: <AlertTriangle />,
      value: data ? format.number(data.poles.fault) : null,
    },
  ] as const;

  return (
    <div className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-surface shadow-xs">
      {tiles.map((tile) => (
        <div key={tile.key} className="grid justify-items-center gap-1 px-2 py-4 text-center">
          <span
            aria-hidden="true"
            className={
              tile.key === 'faults'
                ? 'text-danger [&_svg]:size-5'
                : tile.key === 'working'
                  ? 'text-warning [&_svg]:size-5'
                  : 'text-primary [&_svg]:size-5'
            }
          >
            {tile.icon}
          </span>
          <span className="text-xs text-muted-foreground">{t(tile.key)}</span>
          {tile.value === null ? (
            <Skeleton className="h-6 w-12" />
          ) : (
            <span className="text-base font-bold whitespace-nowrap tabular-nums sm:text-lg">
              {tile.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
