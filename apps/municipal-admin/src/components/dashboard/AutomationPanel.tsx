'use client';

import type { ScheduleDto } from '@smart-light/shared';
import { Skeleton } from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Layers, Sunset, TimerReset } from 'lucide-react';
import { useNow, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useStepLabel } from '@/components/lighting/ScheduleEditor';
import { nextStep } from '@/components/lighting/schedule-visuals';
import { api } from '@/lib/api';

function Item({
  icon,
  title,
  status,
  detail,
  tone,
}: {
  icon: ReactNode;
  title: string;
  status: string;
  detail: string;
  tone: 'success' | 'warning' | 'info';
}) {
  const colour = { success: 'text-success', warning: 'text-warning', info: 'text-info' }[tone];
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border bg-surface-subtle/60 p-3">
      <span aria-hidden="true" className={`mt-0.5 shrink-0 [&_svg]:size-6 ${colour}`}>
        {icon}
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{title}</p>
        <p className={`text-xs font-semibold ${colour}`}>{status}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

/**
 * What runs the lights without anyone pressing a button: the city default schedule,
 * zone schedules and the controller's own astronomical clock. Facts from the schedules
 * API and the device protocol only; no sensor is claimed that is not reported.
 */
export function AutomationPanel() {
  const t = useTranslations('Dashboard.automation');
  const stepLabel = useStepLabel();
  const now = useNow({ updateInterval: 60_000 });
  const schedules = useQuery({
    queryKey: ['schedules'],
    queryFn: () => api.request<ScheduleDto[]>('/v1/schedules'),
  });

  if (schedules.isPending) return <Skeleton className="h-40" />;
  if (schedules.error) return <p className="text-sm text-muted-foreground">{t('failed')}</p>;

  const list = schedules.data;
  const fallback = list.find((schedule) => schedule.isDefault);
  const zoneCount = list.reduce((sum, schedule) => sum + schedule.zones.length, 0);
  const upcoming = fallback ? nextStep(fallback.steps, now) : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Item
        icon={<CalendarClock />}
        title={t('default.title')}
        tone={fallback ? 'success' : 'warning'}
        status={fallback ? fallback.name : t('default.none')}
        detail={upcoming ? t('default.next', { step: stepLabel(upcoming) }) : t('default.safe')}
      />
      <Item
        icon={<Layers />}
        title={t('zones.title')}
        tone="info"
        status={t('zones.status', { count: zoneCount })}
        detail={t('zones.detail', { count: list.length })}
      />
      <Item
        icon={<Sunset />}
        title={t('astro.title')}
        tone="info"
        status={t('astro.status')}
        detail={t('astro.detail')}
      />
      <Item
        icon={<TimerReset />}
        title={t('override.title')}
        tone="info"
        status={t('override.status')}
        detail={t('override.detail')}
      />
    </div>
  );
}
