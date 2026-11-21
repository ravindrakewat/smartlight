'use client';

import type { LightStatusName, WorkOrderStatusName } from '@smart-light/shared';
import { Badge, StatusIndicator, type LightStatus, type Tone } from '@smart-light/ui';
import { useFormatter, useNow, useTranslations } from 'next-intl';

const WORK_ORDER_TONES: Record<WorkOrderStatusName, Tone> = {
  OPEN: 'danger',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  PENDING_VERIFICATION: 'warning',
  RESOLVED: 'success',
  CANCELLED: 'neutral',
};

const PRIORITY_TONES: Record<'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW', Tone> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  NORMAL: 'neutral',
  LOW: 'neutral',
};

const LIGHT_INDICATOR: Record<LightStatusName, LightStatus> = {
  UNKNOWN: 'off',
  ON: 'on',
  DIMMED: 'dimmed',
  OFF: 'off',
  FAULT: 'fault',
  OFFLINE: 'offline',
};

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatusName }) {
  const t = useTranslations('WorkOrderStatus');
  return <Badge tone={WORK_ORDER_TONES[status]}>{t(status)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: keyof typeof PRIORITY_TONES }) {
  const t = useTranslations('Priority');
  return <Badge tone={PRIORITY_TONES[priority]}>{t(priority)}</Badge>;
}

export function LightStatusLabel({ status }: { status: LightStatusName }) {
  const t = useTranslations('LightStatus');
  return <StatusIndicator status={LIGHT_INDICATOR[status]} label={t(status)} />;
}

/** Fault codes come from devices and complaints; unknown ones fall back gracefully. */
export function useFaultLabel(): (fault: string | null) => string {
  const t = useTranslations('Fault');
  return (fault) => {
    const key = fault ?? 'unknown';
    return t.has(key as Parameters<typeof t>[0]) ? t(key as Parameters<typeof t>[0]) : key;
  };
}

/** "in 5 hours" / "3 hours ago", red when the deadline has passed. */
export function DeadlineLabel({ dueAt, overdue }: { dueAt: string; overdue: boolean }) {
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const t = useTranslations('WorkOrders');
  const date = new Date(dueAt);
  return (
    <time
      dateTime={dueAt}
      title={format.dateTime(date, { dateStyle: 'medium', timeStyle: 'short' })}
      className={overdue ? 'font-semibold text-danger' : 'text-muted-foreground'}
    >
      {overdue ? `${t('overdue')} · ` : ''}
      {format.relativeTime(date, now)}
    </time>
  );
}
