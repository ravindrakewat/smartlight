'use client';

import type { HealthCheckData, TenantDto } from '@smart-light/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
  StatusIndicator,
} from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import { Building2, Cpu, Lightbulb, Plus, Wifi } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { TenantsTable } from '@/components/TenantsTable';
import { api } from '@/lib/api';

export default function OverviewPage() {
  const t = useTranslations('Overview');
  const tCommon = useTranslations('Common');
  const format = useFormatter();

  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.request<TenantDto[]>('/v1/tenants'),
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
    }),
    { devices: 0, online: 0, poles: 0 },
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
      <PageHeader
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
            <StatCard
              label={t('stats.municipalities')}
              value={format.number(tenants.data.length)}
              icon={<Building2 />}
              tone="info"
            />
            <StatCard
              label={t('stats.poles')}
              value={format.number(totals.poles)}
              icon={<Lightbulb />}
            />
            <StatCard
              label={t('stats.devices')}
              value={format.number(totals.devices)}
              icon={<Cpu />}
            />
            <StatCard
              label={t('stats.online')}
              value={format.number(totals.online)}
              hint={t('stats.onlineHint', {
                percent: format.number(totals.devices ? totals.online / totals.devices : 0, {
                  style: 'percent',
                  maximumFractionDigits: 1,
                }),
              })}
              icon={<Wifi />}
              tone="success"
            />
          </>
        ) : (
          Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[7.5rem]" />)
        )}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>{t('tenants.title')}</CardTitle>
              <CardDescription>{t('tenants.description')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {tenants.data ? (
              tenants.data.length === 0 ? (
                <EmptyState icon={<Building2 />} title={t('tenants.empty')} />
              ) : (
                <TenantsTable tenants={tenants.data} />
              )
            ) : (
              <Skeleton className="h-40" />
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
