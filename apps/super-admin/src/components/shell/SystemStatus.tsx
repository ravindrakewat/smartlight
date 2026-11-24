'use client';

import type { HealthCheckData } from '@smart-light/shared';
import { cn } from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/** Sidebar card: is the platform reachable, and when did we last hear from it. */
export function SystemStatus() {
  const t = useTranslations('Shell');
  const format = useFormatter();
  const health = useQuery({
    queryKey: ['health', 'ready'],
    queryFn: () => api.request<HealthCheckData>('/health/ready'),
    refetchInterval: 60_000,
    retry: false,
  });
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const up = health.isSuccess && health.data.checks?.database !== 'error';
  const checkedAt = Math.max(health.dataUpdatedAt, health.errorUpdatedAt);

  return (
    <div
      aria-live="polite"
      className="flex items-center gap-3 rounded-xl border border-sidebar-soft bg-sidebar/80 px-3 py-2.5 backdrop-blur"
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-3 shrink-0 rounded-full ring-4',
          health.isPending
            ? 'bg-sidebar-muted ring-sidebar-soft'
            : up
              ? 'bg-[color-mix(in_oklab,var(--color-success),white_30%)] ring-success/30'
              : 'bg-night-danger ring-danger/30',
        )}
      />
      <div className="min-w-0 leading-tight">
        <p className="text-sm font-semibold text-sidebar-foreground">
          {health.isPending ? t('checking') : up ? t('systemOnline') : t('systemDown')}
        </p>
        {checkedAt && now ? (
          <p className="text-xs text-sidebar-muted">
            {t('lastUpdate', { time: format.relativeTime(new Date(checkedAt), now) })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
