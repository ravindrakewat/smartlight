'use client';

import type { AuditEntryDto, HealthCheckData, TenantDto } from '@smart-light/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  KpiCard,
  StatusIndicator,
} from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import { Building2, Lightbulb, Plus, TriangleAlert, Wifi, LayoutDashboard } from 'lucide-react';
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

      <section aria-label={t('title')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tenants.data ? (
          <>
            <KpiCard
              label={t('stats.municipalities')}
              value={format.number(tenants.data.length)}
              icon={<Building2 />}
              tone="info"
            />
            <KpiCard
              label={t('stats.poles')}
              value={format.number(totals.poles)}
              icon={<Lightbulb />}
              tone="info"
            />
            <KpiCard
              label={t('stats.online')}
              value={format.number(totals.online)}
              hint={t('stats.onlineHint', {
                total: format.number(totals.devices),
                percent: format.number(totals.devices ? totals.online / totals.devices : 0, {
                  style: 'percent',
                  maximumFractionDigits: 1,
                }),
              })}
              share={totals.devices ? totals.online / totals.devices : null}
              icon={<Wifi />}
              tone="success"
            />
            <KpiCard
              label={t('stats.problems')}
              value={format.number(totals.problems)}
              hint={t('stats.problemsHint')}
              share={totals.poles ? totals.problems / totals.poles : null}
              icon={<TriangleAlert />}
              tone={totals.problems > 0 ? 'danger' : 'success'}
            />
          </>
        ) : (
          Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)
        )}
      </section>

      <section aria-labelledby="cities-heading" className="mt-8">
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

      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>{t('activity.title')}</CardTitle>
              <CardDescription>{t('activity.description')}</CardDescription>
            </div>
            <Link href="/audit" className="text-sm font-medium text-primary hover:underline">
              {t('activity.all')}
            </Link>
          </CardHeader>
          <CardContent>
            {activity.data ? (
              <RecentActivity entries={activity.data.items} />
            ) : activity.error ? (
              <p className="text-sm text-muted-foreground">{tCommon('errorBody')}</p>
            ) : (
              <Skeleton className="h-48" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t('health.title')}</CardTitle>
              <CardDescription>{t('health.description')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {services.map((service) => (
                <li key={service.key} className="flex items-center justify-between gap-3 py-3">
                  <span className="font-medium">{t(`health.${service.key}`)}</span>
                  <StatusIndicator status={service.state} label={serviceLabel(service.state)} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
