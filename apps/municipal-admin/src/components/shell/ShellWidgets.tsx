'use client';

import type { DeviceEventDto, HealthCheckData } from '@smart-light/shared';
import { Button, cn } from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import { Bell, Maximize, Minimize, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

/** Open controller alerts (shared by the bell and the sidebar badge). */
function useOpenAlertCount(): number | null {
  const { data } = useQuery({
    queryKey: ['alerts', 'open-count'],
    queryFn: () => api.page<DeviceEventDto>('/v1/alerts', { query: { pageSize: 1 } }),
    refetchInterval: 60_000,
    retry: false,
  });
  return data ? data.pagination.totalItems : null;
}

/** Search box in the top bar: finds poles by code, address or ward. */
export function HeaderSearch() {
  const t = useTranslations('Shell');
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const query = value.trim();
    router.push(query ? `/poles?search=${encodeURIComponent(query)}` : '/poles');
  };

  return (
    <form role="search" onSubmit={submit} className="relative">
      <label htmlFor={id} className="sr-only">
        {t('search')}
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t('searchPlaceholder')}
        className="h-11 w-full rounded-full border border-border bg-surface-subtle pr-4 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:bg-surface"
      />
    </form>
  );
}

/** Bell in the top bar with the number of open alerts. */
export function AlertsBell() {
  const t = useTranslations('Shell');
  const format = useFormatter();
  const count = useOpenAlertCount();
  return (
    <Link
      href="/alerts"
      aria-label={count ? t('alertsOpen', { count }) : t('alerts')}
      title={count ? t('alertsOpen', { count }) : t('alerts')}
      className="relative grid size-11 place-items-center rounded-full text-foreground hover:bg-surface-subtle"
    >
      <Bell aria-hidden="true" className="size-5" />
      {count ? (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[0.6875rem] leading-5 font-bold text-danger-foreground tabular-nums"
        >
          {count > 99 ? '99+' : format.number(count)}
        </span>
      ) : null}
    </Link>
  );
}

/** Count after "Alerts" in the sidebar. */
export function AlertsNavBadge() {
  const t = useTranslations('Shell');
  const format = useFormatter();
  const count = useOpenAlertCount();
  if (!count) return null;
  return (
    <span className="grid min-w-6 place-items-center rounded-full bg-danger px-1.5 text-xs leading-6 font-bold text-danger-foreground tabular-nums">
      {count > 99 ? '99+' : format.number(count)}
      <span className="sr-only"> {t('openShort')}</span>
    </span>
  );
}

/** Full-screen toggle, handy on the control-room wall display. */
export function FullscreenButton() {
  const t = useTranslations('Shell');
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    setSupported(document.fullscreenEnabled);
    const sync = () => setActive(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  if (!supported) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="hidden rounded-full md:inline-flex"
      aria-pressed={active}
      aria-label={t('fullscreen')}
      title={t('fullscreen')}
      onClick={() => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      }}
    >
      {active ? <Minimize /> : <Maximize />}
    </Button>
  );
}

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
