'use client';

import type { HealthCheckData, TenantDto } from '@smart-light/shared';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  PageHeader,
  Skeleton,
  StatusIndicator,
} from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import { Database, RefreshCw, Radio, Server, Timer } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';

const SEGMENTS = 20;

type ServiceState = 'on' | 'fault' | 'off';

interface ReadyResult {
  data: HealthCheckData;
  /** Round trip from this browser, in milliseconds. */
  latencyMs: number;
}

export default function SystemHealthPage() {
  const t = useTranslations('Health');
  const format = useFormatter();
  const locale = useLocale();

  const ready = useQuery({
    queryKey: ['health', 'ready'],
    queryFn: async (): Promise<ReadyResult> => {
      const started = performance.now();
      const data = await api.request<HealthCheckData>('/health/ready');
      return { data, latencyMs: Math.round(performance.now() - started) };
    },
    refetchInterval: 30_000,
    retry: false,
  });
  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.request<TenantDto[]>('/v1/tenants'),
    refetchInterval: 60_000,
  });

  const apiState: ServiceState = ready.isPending ? 'off' : ready.isSuccess ? 'on' : 'fault';
  const dbState: ServiceState = ready.isPending
    ? 'off'
    : ready.data?.data.checks?.database === 'ok'
      ? 'on'
      : 'fault';
  const stateLabel = (state: ServiceState) =>
    state === 'on' ? t('operational') : state === 'fault' ? t('down') : t('notConnected');
  const uptime = ready.data?.data.uptimeSeconds ?? 0;
  const uptimeText =
    uptime >= 86_400
      ? t('uptime.days', { count: Math.floor(uptime / 86_400) })
      : uptime >= 3_600
        ? t('uptime.hours', { count: Math.floor(uptime / 3_600) })
        : t('uptime.minutes', { count: Math.max(1, Math.floor(uptime / 60)) });

  const services: {
    key: 'api' | 'database' | 'broker' | 'queue';
    icon: ReactNode;
    state: ServiceState;
    detail: string;
  }[] = [
    {
      key: 'api',
      icon: <Server />,
      state: apiState,
      detail: ready.data
        ? t('apiDetail', {
            version: ready.data.data.version,
            environment: ready.data.data.environment,
            uptime: uptimeText,
          })
        : ready.isError
          ? t('apiDown')
          : '',
    },
    {
      key: 'database',
      icon: <Database />,
      state: dbState,
      detail: ready.data ? t('latency', { ms: format.number(ready.data.latencyMs) }) : '',
    },
    { key: 'broker', icon: <Radio />, state: 'off', detail: t('brokerDetail') },
    { key: 'queue', icon: <Timer />, state: 'off', detail: t('queueDetail') },
  ];

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void ready.refetch();
              void tenants.refetch();
            }}
            disabled={ready.isFetching}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(ready.isFetching && 'motion-safe:animate-spin')}
            />
            {t('checkNow')}
          </Button>
        }
      />

      <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
        {ready.dataUpdatedAt || ready.errorUpdatedAt
          ? t('lastChecked', {
              time: format.dateTime(new Date(Math.max(ready.dataUpdatedAt, ready.errorUpdatedAt)), {
                timeStyle: 'medium',
              }),
            })
          : t('checking')}
      </p>

      <section
        aria-label={t('servicesHeading')}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {services.map((service) => (
          <div
            key={service.key}
            className={cn(
              'flex flex-col gap-3 rounded-2xl border bg-surface p-5',
              service.state === 'fault' ? 'border-danger' : 'border-border',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-surface-subtle text-muted-foreground [&_svg]:size-5">
                {service.icon}
              </span>
              <StatusIndicator status={service.state} label={stateLabel(service.state)} />
            </div>
            <div>
              <h2 className="font-semibold">{t(`services.${service.key}`)}</h2>
              <p className="text-sm text-muted-foreground">{service.detail}</p>
            </div>
          </div>
        ))}
      </section>

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle>{t('fleet.title')}</CardTitle>
            <CardDescription>{t('fleet.description')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {tenants.data ? (
            <ul className="grid gap-4">
              {tenants.data.map((tenant) => {
                const share =
                  tenant.stats.devices === 0
                    ? null
                    : tenant.stats.devicesOnline / tenant.stats.devices;
                return (
                  <li key={tenant.id}>
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">
                        {locale === 'hi' ? tenant.nameHi : tenant.name}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {share === null
                          ? t('fleet.noDevices')
                          : t('fleet.online', {
                              online: format.number(tenant.stats.devicesOnline),
                              total: format.number(tenant.stats.devices),
                              percent: format.number(share, {
                                style: 'percent',
                                maximumFractionDigits: 1,
                              }),
                            })}
                      </span>
                    </div>
                    {/* 20 segments of 5% each: a bar without inline styles */}
                    <div aria-hidden="true" className="flex h-2.5 gap-0.5">
                      {Array.from({ length: SEGMENTS }, (_, index) => (
                        <span
                          key={index}
                          className={cn(
                            'flex-1 first:rounded-l-full last:rounded-r-full',
                            share !== null && index < Math.round(share * SEGMENTS)
                              ? share >= 0.95
                                ? 'bg-success'
                                : share >= 0.8
                                  ? 'bg-warning'
                                  : 'bg-danger'
                              : 'bg-surface-subtle',
                          )}
                        />
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Skeleton className="h-24" />
          )}
        </CardContent>
      </Card>
    </>
  );
}
