'use client';

import {
  DASHBOARD_RANGES,
  type DashboardActivityDto,
  type DashboardRange,
  type DashboardSummaryDto,
  type DeviceEventDto,
  type PoleMapItemDto,
  type WorkOrderSummaryDto,
} from '@smart-light/shared';
import { Alert, Card, cn, EmptyState, KpiCard, Skeleton } from '@smart-light/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  CircleAlert,
  CircleCheck,
  Clock,
  Cpu,
  Info,
  LayoutDashboard,
  MapPin,
  MapPinned,
  TriangleAlert,
  WifiOff,
  Wrench,
  Zap,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { ActivityChart } from '@/components/charts/ActivityChart';
import { StatusDonut } from '@/components/charts/StatusDonut';
import { DeadlineLabel, PriorityBadge, PRIORITY_TONES, useFaultLabel } from '@/components/labels';
import { ZoneStreet } from '@/components/lighting/ZoneStreet';
import { useSessionUser } from '@/components/Session';
import { ConsoleHero } from '@/components/shell/ConsoleHero';
import { api } from '@/lib/api';

const REFRESH_MS = 60_000;
/** Zones drawn as streets on the dashboard (most faults first); the rest are on Street view. */
const DASHBOARD_STREETS = 4;

/** MapLibre needs the browser (WebGL); load it only when the dashboard renders. */
const PoleMap = dynamic(
  () => import('@/components/lighting/PoleMap').then((module) => module.PoleMap),
  { ssr: false, loading: () => <Skeleton className="h-80" /> },
);

const PRIORITY_BORDER = {
  danger: 'border-l-danger',
  warning: 'border-l-brand',
  info: 'border-l-primary',
  success: 'border-l-success',
  neutral: 'border-l-border',
} as const;

/** Card with an icon title and an optional "view all" link. */
function Panel({
  id,
  title,
  icon,
  link,
  className,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  link?: { href: string; label: string };
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <section aria-labelledby={id} className="flex flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
            <span aria-hidden="true" className="text-primary [&_svg]:size-5">
              {icon}
            </span>
            {title}
          </h2>
          {link ? (
            <Link
              href={link.href}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              {link.label}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
        </div>
        <div className="flex-1 px-5 pb-5">{children}</div>
      </section>
    </Card>
  );
}

export default function DashboardPage() {
  const t = useTranslations('Dashboard');
  const tCommon = useTranslations('Common');
  const tMap = useTranslations('Lighting.map');
  const tLight = useTranslations('LightStatus');
  const router = useRouter();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const faultLabel = useFaultLabel();
  const user = useSessionUser();
  const [range, setRange] = useState<DashboardRange>('7d');

  const summary = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.request<DashboardSummaryDto>('/v1/dashboard/summary'),
    refetchInterval: REFRESH_MS,
  });
  const activity = useQuery({
    queryKey: ['dashboard-activity', range],
    queryFn: () =>
      api.request<DashboardActivityDto>('/v1/dashboard/activity', { query: { range } }),
    refetchInterval: REFRESH_MS * 5,
    placeholderData: keepPreviousData,
  });
  const mapPoles = useQuery({
    queryKey: ['pole-map'],
    queryFn: () => api.request<PoleMapItemDto[]>('/v1/poles/map'),
    refetchInterval: REFRESH_MS,
  });
  const urgent = useQuery({
    queryKey: ['work-orders', 'urgent'],
    queryFn: () =>
      api.page<WorkOrderSummaryDto>('/v1/work-orders', { query: { open: true, pageSize: 5 } }),
    refetchInterval: REFRESH_MS,
  });
  const events = useQuery({
    queryKey: ['alerts', 'recent'],
    queryFn: () => api.page<DeviceEventDto>('/v1/alerts', { query: { open: false, pageSize: 6 } }),
    refetchInterval: REFRESH_MS,
    retry: false,
  });

  const share = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);
  const percent = (value: number) =>
    format.number(value, { style: 'percent', maximumFractionDigits: 1 });
  const poles = summary.data?.poles;
  const devices = summary.data?.devices;
  const city = user.tenant?.name ?? '';

  return (
    <>
      <ConsoleHero
        title={t('hero.title')}
        accent={t('hero.accent')}
        description={t('hero.description', { city })}
        icon={<LayoutDashboard />}
      />

      {summary.error ? (
        <Alert tone="danger" title={tCommon('errorTitle')} className="mb-4">
          {tCommon('errorBody')}
        </Alert>
      ) : null}

      <section
        aria-label={t('stats.heading')}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      >
        {poles && devices ? (
          <>
            <KpiCard
              label={t('stats.totalLights')}
              value={format.number(poles.total)}
              hint={t('stats.zones', { count: summary.data?.zones.length ?? 0 })}
              icon={<Zap />}
              tone="info"
            />
            <KpiCard
              label={t('stats.working')}
              value={format.number(poles.working)}
              hint={t('stats.shareOfTotal', {
                percent: percent(share(poles.working, poles.total)),
              })}
              share={share(poles.working, poles.total)}
              icon={<CircleCheck />}
              tone="success"
            />
            <KpiCard
              label={t('stats.faulty')}
              value={format.number(poles.fault)}
              hint={t('stats.shareOfTotal', { percent: percent(share(poles.fault, poles.total)) })}
              share={share(poles.fault, poles.total)}
              icon={<TriangleAlert />}
              tone="danger"
            />
            <KpiCard
              label={t('stats.offline')}
              value={format.number(poles.offline)}
              hint={t('stats.shareOfTotal', {
                percent: percent(share(poles.offline, poles.total)),
              })}
              share={share(poles.offline, poles.total)}
              icon={<WifiOff />}
              tone="warning"
            />
            <KpiCard
              label={t('stats.controllers')}
              value={percent(share(devices.online, devices.total))}
              hint={t('stats.controllersHint', {
                online: format.number(devices.online),
                total: format.number(devices.total),
              })}
              share={share(devices.online, devices.total)}
              icon={<Cpu />}
              tone="info"
            />
          </>
        ) : (
          Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-28" />)
        )}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel
          id="status-overview"
          title={t('overview.title')}
          icon={<BarChart3 />}
          className="xl:col-span-2"
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            {poles ? (
              <StatusDonut
                centreValue={format.number(share(poles.working, poles.total - poles.unknown), {
                  style: 'percent',
                  maximumFractionDigits: 0,
                })}
                centreLabel={t('overview.working')}
                totalLabel={t('overview.total')}
                slices={[
                  {
                    key: 'working',
                    label: t('stats.working'),
                    value: poles.working,
                    strokeClass: 'stroke-success',
                    dotClass: 'bg-success',
                  },
                  {
                    key: 'fault',
                    label: tLight('FAULT'),
                    value: poles.fault,
                    strokeClass: 'stroke-danger',
                    dotClass: 'bg-danger',
                  },
                  {
                    key: 'offline',
                    label: tLight('OFFLINE'),
                    value: poles.offline,
                    strokeClass: 'stroke-brand',
                    dotClass: 'bg-brand',
                  },
                  {
                    key: 'unknown',
                    label: tLight('UNKNOWN'),
                    value: poles.unknown,
                    strokeClass: 'stroke-neutral/40',
                    dotClass: 'bg-neutral/40',
                  },
                ]}
              />
            ) : (
              <Skeleton className="h-44" />
            )}

            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t('activity.title')}</h3>
                <div role="group" aria-label={t('activity.range')} className="flex gap-1">
                  {DASHBOARD_RANGES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={range === value}
                      onClick={() => setRange(value)}
                      className={cn(
                        'min-h-11 min-w-12 rounded-full px-3 text-sm font-semibold transition-colors',
                        range === value
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-surface-subtle',
                      )}
                    >
                      {t(`activity.ranges.${value}`)}
                    </button>
                  ))}
                </div>
              </div>
              {activity.data ? (
                <ActivityChart data={activity.data} />
              ) : activity.error ? (
                <p className="text-sm text-muted-foreground">{tCommon('errorBody')}</p>
              ) : (
                <Skeleton className="h-60" />
              )}
            </div>
          </div>
        </Panel>

        <Panel
          id="live-map"
          title={t('map.title')}
          icon={<MapPin />}
          link={{ href: '/map', label: t('map.openFull') }}
        >
          {mapPoles.data && mapPoles.data.length > 0 ? (
            <PoleMap
              poles={mapPoles.data}
              className="h-80 min-h-0 overflow-hidden rounded-xl"
              label={tMap('label', { count: mapPoles.data.length })}
              statusLabel={(status) => tLight(status)}
              openLabel={tMap('open')}
              onOpen={(poleId) => router.push(`/poles/${poleId}`)}
            />
          ) : mapPoles.isPending ? (
            <Skeleton className="h-80" />
          ) : (
            <EmptyState
              className="min-h-80"
              icon={<MapPinned />}
              title={t('map.emptyTitle')}
              description={t('map.emptyDescription')}
            />
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel
          id="urgent-repairs"
          title={t('openWork.title')}
          icon={<Wrench />}
          link={{ href: '/work-orders', label: t('openWork.viewAll') }}
          className="xl:col-span-2"
        >
          {urgent.data ? (
            urgent.data.items.length === 0 ? (
              <EmptyState icon={<CircleCheck />} title={t('openWork.empty')} />
            ) : (
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <caption className="sr-only">{t('openWork.title')}</caption>
                  <thead className="bg-surface-subtle/70 text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2.5 pr-3 pl-5 font-medium">
                        {t('openWork.columns.pole')}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        {t('openWork.columns.location')}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        {t('openWork.columns.issue')}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        {t('openWork.columns.priority')}
                      </th>
                      <th scope="col" className="py-2.5 pr-5 pl-3 font-medium">
                        {t('openWork.columns.deadline')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {urgent.data.items.map((workOrder) => (
                      <tr
                        key={workOrder.id}
                        className={cn(
                          'border-l-4 hover:bg-surface-subtle/60',
                          PRIORITY_BORDER[PRIORITY_TONES[workOrder.priority]],
                        )}
                      >
                        <th scope="row" className="py-3 pr-3 pl-4 font-normal">
                          <Link
                            href={`/work-orders/${workOrder.id}`}
                            className="font-mono font-medium text-primary hover:underline"
                          >
                            {workOrder.pole.code}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {workOrder.number}
                          </span>
                        </th>
                        <td className="px-3 py-3">
                          {workOrder.pole.zoneName ?? '—'}
                          {workOrder.pole.address ? (
                            <span className="block max-w-[16rem] truncate text-xs text-muted-foreground">
                              {workOrder.pole.address}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 font-medium">{faultLabel(workOrder.faultType)}</td>
                        <td className="px-3 py-3">
                          <PriorityBadge priority={workOrder.priority} />
                        </td>
                        <td className="py-3 pr-5 pl-3">
                          <DeadlineLabel dueAt={workOrder.slaDueAt} overdue={workOrder.overdue} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="grid gap-3">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-12" />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          id="recent-events"
          title={t('events.title')}
          icon={<Clock />}
          link={{ href: '/alerts', label: t('events.viewAll') }}
        >
          {events.data ? (
            events.data.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('events.empty')}</p>
            ) : (
              <ol className="grid gap-1">
                {events.data.items.map((event) => {
                  const fixed = event.resolvedAt !== null;
                  return (
                    <li key={event.id} className="flex items-start gap-3 py-2 text-sm">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-0.5 [&_svg]:size-4',
                          fixed
                            ? 'text-success'
                            : event.severity === 'critical'
                              ? 'text-danger'
                              : event.severity === 'warning'
                                ? 'text-warning'
                                : 'text-info',
                        )}
                      >
                        {fixed ? (
                          <CircleCheck />
                        ) : event.severity === 'info' ? (
                          <Info />
                        ) : (
                          <CircleAlert />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block">
                          {t(fixed ? 'events.fixed' : 'events.raised', {
                            fault: faultLabel(event.type),
                            pole: event.pole?.code ?? event.deviceId,
                          })}
                        </span>
                        <time dateTime={event.receivedAt} className="text-xs text-muted-foreground">
                          {format.relativeTime(new Date(event.receivedAt), now)}
                        </time>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )
          ) : events.error ? (
            <p className="text-sm text-muted-foreground">{t('events.noAccess')}</p>
          ) : (
            <Skeleton className="h-56" />
          )}
        </Panel>
      </div>

      <Panel
        id="zone-streets"
        title={t('zones.title')}
        icon={<MapPinned />}
        link={{ href: '/streets', label: t('zones.openStreets') }}
        className="mt-6"
      >
        {summary.data && mapPoles.data ? (
          <div className="grid gap-3">
            {[...summary.data.zones]
              .sort((a, b) => b.fault + b.offline - (a.fault + a.offline))
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
          </div>
        ) : (
          <Skeleton className="h-48" />
        )}
      </Panel>
    </>
  );
}
