'use client';

import type { AuditEntryDto, HealthCheckData, TenantDto } from '@smart-light/shared';
import {
  Alert,
  Button,
  EmptyState,
  Panel,
  Skeleton,
  StatTile,
  StatusIndicator,
  StreetLightIcon,
} from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Building2,
  History,
  LayoutDashboard,
  Plus,
  TriangleAlert,
  Wifi,
} from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { CityCard } from '@/components/CityCard';
import { RecentActivity } from '@/components/RecentActivity';
import { api } from '@/lib/api';
import { ConsoleHero } from '@/components/shell/ConsoleHero';

export default function OverviewPage() {
  const t = useTranslations('Overview');
  const tCommon = useTranslations('Common');
  const format = useFormatter();

  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.request<TenantDto[]>('/v1/tenants'),
    refetchInterval: 60_000,
  });
  const activity = useQuery({
    queryKey: ['audit', 'recent'],
    queryFn: () => api.page<AuditEntryDto>('/v1/audit', { query: { page: 1, pageSize: 6 } }),
    refetchInterval: 60_000,
  });
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.request<HealthCheckData>('/health/ready'),
    refetchInterval: 30_000,
    retry: false,
  });

  const totals = (tenants.data ?? []).reduce(
    (sum, tenant) => ({
      devices: sum.devices + tenant.stats.devices,
      online: sum.online + tenant.stats.devicesOnline,
      poles: sum.poles + tenant.stats.poles,
      problems:
        sum.problems + (tenant.stats.lights?.FAULT ?? 0) + (tenant.stats.lights?.OFFLINE ?? 0),
    }),
    { devices: 0, online: 0, poles: 0, problems: 0 },
  );
  // Cities with the most lights needing repair first.
  const cities = [...(tenants.data ?? [])].sort(
    (a, b) =>
      (b.stats.lights?.FAULT ?? 0) +
        (b.stats.lights?.OFFLINE ?? 0) -
        ((a.stats.lights?.FAULT ?? 0) + (a.stats.lights?.OFFLINE ?? 0)) ||
      b.stats.poles - a.stats.poles,
  );

  const apiUp = health.isSuccess;
  const databaseUp = health.data?.checks?.database === 'ok';
  const services: {
    key: 'api' | 'database' | 'broker' | 'queue';
    state: 'on' | 'fault' | 'off';
  }[] = [
    { key: 'api', state: health.isPending ? 'off' : apiUp ? 'on' : 'fault' },
    { key: 'database', state: health.isPending ? 'off' : databaseUp ? 'on' : 'fault' },
    { key: 'broker', state: 'off' },
    { key: 'queue', state: 'off' },
  ];
  const serviceLabel = (state: 'on' | 'fault' | 'off') =>
    state === 'on'
      ? t('health.operational')
      : state === 'fault'
        ? t('health.down')
        : t('health.notConnected');

  const percent = (part: number, whole: number) =>
    format.number(whole ? part / whole : 0, { style: 'percent', maximumFractionDigits: 1 });

  return (
    <>
      <ConsoleHero
        icon={<LayoutDashboard />}
        title={t('title')}
        description={t('description')}
        actions={
          <Button asChild>
            <Link href="/municipalities">
              <Plus />
              {t('tenants.onboard')}
            </Link>
          </Button>
        }
      />

      {tenants.error ? (
        <Alert tone="danger" title={tCommon('errorTitle')} className="mb-4">
          {tCommon('errorBody')}
        </Alert>
      ) : null}

      <section aria-label={t('title')} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          tone="purple"
          icon={<Building2 />}
          label={t('stats.municipalities')}
          loading={!tenants.data}
          value={tenants.data ? format.number(tenants.data.length) : ''}
        />
        <StatTile
          tone="blue"
          icon={<StreetLightIcon />}
          label={t('stats.poles')}
          loading={!tenants.data}
          value={format.number(totals.poles)}
        />
        <StatTile
          tone="green"
          icon={<Wifi />}
          label={t('stats.online')}
          loading={!tenants.data}
          value={format.number(totals.online)}
          note={percent(totals.online, totals.devices)}
        />
        <StatTile
          tone="red"
          icon={<TriangleAlert />}
          label={t('stats.problems')}
          loading={!tenants.data}
          value={format.number(totals.problems)}
          note={percent(totals.problems, totals.poles)}
        />
      </section>

      <section aria-labelledby="cities-heading" className="mt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="cities-heading" className="text-lg font-semibold">
              {t('tenants.title')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('tenants.description')}</p>
          </div>
          <Link href="/municipalities" className="text-sm font-medium text-primary hover:underline">
            {t('tenants.manage')}
          </Link>
        </div>
        {tenants.data ? (
          cities.length === 0 ? (
            <EmptyState icon={<Building2 />} title={t('tenants.empty')} />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
              {cities.map((tenant) => (
                <CityCard key={tenant.id} tenant={tenant} />
              ))}
            </div>
          )
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Panel
          id="recent-activity"
          title={t('activity.title')}
          icon={<History />}
          link={{ href: '/audit', label: t('activity.all') }}
          className="xl:col-span-2"
        >
          <p className="mb-3 text-sm text-muted-foreground">{t('activity.description')}</p>
          {activity.data ? (
            <RecentActivity entries={activity.data.items} />
          ) : activity.error ? (
            <p className="text-sm text-muted-foreground">{tCommon('errorBody')}</p>
          ) : (
            <Skeleton className="h-48" />
          )}
        </Panel>
        <Panel
          id="platform-health"
          title={t('health.title')}
          icon={<Activity />}
          link={{ href: '/health', label: t('health.details') }}
        >
          <p className="mb-1 text-sm text-muted-foreground">{t('health.description')}</p>
          <ul className="divide-y divide-border">
            {services.map((service) => (
              <li key={service.key} className="flex items-center justify-between gap-3 py-3">
                <span className="font-medium">{t(`health.${service.key}`)}</span>
                <StatusIndicator status={service.state} label={serviceLabel(service.state)} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
