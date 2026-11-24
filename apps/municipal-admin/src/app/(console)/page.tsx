'use client';

import type { DashboardSummaryDto, PoleMapItemDto, WorkOrderSummaryDto } from '@smart-light/shared';
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
} from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Cpu, Lightbulb, MapPinned, WifiOff, Zap } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import {
  DeadlineLabel,
  PriorityBadge,
  useFaultLabel,
  WorkOrderStatusBadge,
} from '@/components/labels';
import { ZoneStreet } from '@/components/lighting/ZoneStreet';
import { api } from '@/lib/api';

const REFRESH_MS = 60_000;
/** Zones drawn as streets on the dashboard (most faults first); the rest are on Street view. */
const DASHBOARD_STREETS = 6;

/** MapLibre needs the browser (WebGL); load it only when the dashboard renders. */
const PoleMap = dynamic(
  () => import('@/components/lighting/PoleMap').then((module) => module.PoleMap),
  { ssr: false, loading: () => <Skeleton className="h-72" /> },
);

export default function DashboardPage() {
  const t = useTranslations('Dashboard');
  const tCommon = useTranslations('Common');
  const tMap = useTranslations('Lighting.map');
  const tLight = useTranslations('LightStatus');
  const router = useRouter();
  const format = useFormatter();
  const faultLabel = useFaultLabel();

  const summary = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.request<DashboardSummaryDto>('/v1/dashboard/summary'),
    refetchInterval: REFRESH_MS,
  });
  const mapPoles = useQuery({
    queryKey: ['pole-map'],
    queryFn: () => api.request<PoleMapItemDto[]>('/v1/poles/map'),
    refetchInterval: REFRESH_MS,
  });
  const urgent = useQuery({
    queryKey: ['work-orders', 'urgent'],
    queryFn: () =>
      api.page<WorkOrderSummaryDto>('/v1/work-orders', { query: { open: true, pageSize: 6 } }),
    refetchInterval: REFRESH_MS,
  });

  const percent = (part: number, whole: number) =>
    format.number(whole === 0 ? 0 : part / whole, { style: 'percent', maximumFractionDigits: 1 });

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />

      {summary.error ? (
        <Alert tone="danger" title={tCommon('errorTitle')}>
          {tCommon('errorBody')}
        </Alert>
      ) : null}

      <section aria-label={t('title')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {summary.data ? (
          <>
            <StatCard
              label={t('stats.totalLights')}
              value={format.number(summary.data.poles.total)}
              icon={<Lightbulb />}
              tone="info"
            />
            <StatCard
              label={t('stats.working')}
              value={format.number(summary.data.poles.working)}
              hint={t('stats.shareOfTotal', {
                percent: percent(summary.data.poles.working, summary.data.poles.total),
              })}
              icon={<Zap />}
              tone="success"
            />
            <StatCard
              label={t('stats.faulty')}
              value={format.number(summary.data.poles.fault)}
              hint={t('stats.shareOfTotal', {
                percent: percent(summary.data.poles.fault, summary.data.poles.total),
              })}
              icon={<CircleAlert />}
              tone="danger"
            />
            <StatCard
              label={t('stats.offline')}
              value={format.number(summary.data.poles.offline)}
              hint={t('stats.shareOfTotal', {
                percent: percent(summary.data.poles.offline, summary.data.poles.total),
              })}
              icon={<WifiOff />}
              tone="warning"
            />
            <StatCard
              label={t('stats.controllers')}
              value={percent(summary.data.devices.online, summary.data.devices.total)}
              hint={t('stats.controllersHint', {
                online: format.number(summary.data.devices.online),
                total: format.number(summary.data.devices.total),
              })}
              icon={<Cpu />}
              tone="neutral"
            />
          </>
        ) : (
          Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-[7.5rem]" />)
        )}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>{t('openWork.title')}</CardTitle>
              <CardDescription>{t('openWork.description')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {urgent.data ? (
              urgent.data.items.length === 0 ? (
                <EmptyState icon={<Zap />} title={t('openWork.empty')} />
              ) : (
                <ul className="divide-y divide-border">
                  {urgent.data.items.map((workOrder) => (
                    <li key={workOrder.id}>
                      <Link
                        href={`/work-orders/${workOrder.id}`}
                        className="-mx-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-2 py-3 hover:bg-surface-subtle"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">
                            {faultLabel(workOrder.faultType)}{' '}
                            <span className="font-mono text-sm text-muted-foreground">
                              {workOrder.pole.code}
                            </span>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {workOrder.number}
                            {workOrder.pole.zoneName ? ` · ${workOrder.pole.zoneName}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <PriorityBadge priority={workOrder.priority} />
                          <WorkOrderStatusBadge status={workOrder.status} />
                          <DeadlineLabel dueAt={workOrder.slaDueAt} overdue={workOrder.overdue} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <div className="grid gap-3">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-14" />
                ))}
              </div>
            )}
            <Button asChild variant="outline" className="mt-3 w-full">
              <Link href="/work-orders">{t('openWork.viewAll')}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t('map.title')}</CardTitle>
              <CardDescription>{t('map.description')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {mapPoles.data && mapPoles.data.length > 0 ? (
              <>
                <PoleMap
                  poles={mapPoles.data}
                  className="h-72 min-h-0"
                  label={tMap('label', { count: mapPoles.data.length })}
                  statusLabel={(status) => tLight(status)}
                  openLabel={tMap('open')}
                  onOpen={(poleId) => router.push(`/poles/${poleId}`)}
                />
                <Link href="/map" className="text-sm font-semibold text-primary hover:underline">
                  {t('map.openFull')}
                </Link>
              </>
            ) : mapPoles.isPending ? (
              <Skeleton className="h-72" />
            ) : (
              <EmptyState
                className="min-h-72"
                icon={<MapPinned />}
                title={t('map.emptyTitle')}
                description={t('map.emptyDescription')}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle>{t('zones.title')}</CardTitle>
            <CardDescription>{t('zones.description')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {summary.data && mapPoles.data ? (
            <>
              {[...summary.data.zones]
                .sort((a, b) => b.fault - a.fault)
                .slice(0, DASHBOARD_STREETS)
                .map((zone) => (
                  <ZoneStreet
                    key={zone.id}
                    zone={zone}
                    poles={mapPoles.data.filter((pole) => pole.zoneId === zone.id)}
                    compact
                    headingLevel="h3"
                  />
                ))}
              <Link href="/streets" className="text-sm font-semibold text-primary hover:underline">
                {t('zones.openStreets')}
              </Link>
            </>
          ) : (
            <Skeleton className="h-48" />
          )}
        </CardContent>
      </Card>
    </>
  );
}
