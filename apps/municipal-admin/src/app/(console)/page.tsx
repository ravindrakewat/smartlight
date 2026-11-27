'use client';

import {
  DASHBOARD_RANGES,
  type DashboardActivityDto,
  type DashboardRange,
  type DashboardSummaryDto,
  type DeviceEventDto,
  type PoleMapItemDto,
  type ReportBreakdownDto,
  type WorkOrderSummaryDto,
} from '@smart-light/shared';
import { Alert, Card, cn, EmptyState, Input, Select, Skeleton } from '@smart-light/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bolt,
  CalendarClock,
  CircleCheck,
  Gauge,
  Leaf,
  Lightbulb,
  LayoutDashboard,
  Maximize2,
  MapPinned,
  Power,
  Radio,
  Search,
  SunDim,
  TriangleAlert,
  WifiOff,
  Wrench,
  Zap,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ActivityChart } from '@/components/charts/ActivityChart';
import { StatusDonut } from '@/components/charts/StatusDonut';
import { AutomationPanel } from '@/components/dashboard/AutomationPanel';
import { EnergyBars } from '@/components/dashboard/EnergyBars';
import { SelectedLight } from '@/components/dashboard/SelectedLight';
import { StatTile } from '@/components/dashboard/StatTile';
import { DeadlineLabel, PriorityBadge, useFaultLabel } from '@/components/labels';
import { ZoneStreet } from '@/components/lighting/ZoneStreet';
import { useSessionUser } from '@/components/Session';
import { ConsoleHero } from '@/components/shell/ConsoleHero';
import { api } from '@/lib/api';

const REFRESH_MS = 60_000;
/** Zones drawn as streets on the dashboard (most faults first); the rest are on Street view. */
const DASHBOARD_STREETS = 4;
const CONTROLLERS = new Set(['SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'SUPERVISOR', 'OPERATOR']);
/** Roles that may read reports (energy per day). */
const REPORT_READERS = CONTROLLERS;

/** MapLibre needs the browser (WebGL); load it only when the dashboard renders. */
const PoleMap = dynamic(
  () => import('@/components/lighting/PoleMap').then((module) => module.PoleMap),
  { ssr: false, loading: () => <Skeleton className="h-full min-h-80" /> },
);

/** Legend dots for the map, in the map's own status colours. */
const LEGEND: { status: PoleMapItemDto['lightStatus']; dot: string }[] = [
  { status: 'ON', dot: 'bg-success' },
  { status: 'DIMMED', dot: 'bg-info' },
  { status: 'OFF', dot: 'bg-neutral' },
  { status: 'FAULT', dot: 'bg-danger' },
  { status: 'OFFLINE', dot: 'bg-warning' },
  { status: 'UNKNOWN', dot: 'bg-muted-foreground' },
];

/** Compact dark card with an icon title and an optional "view all" link. */
function Panel({
  id,
  title,
  icon,
  link,
  actions,
  className,
  bodyClassName,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  link?: { href: string; label: string };
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <section aria-labelledby={id} className="flex flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-3">
          <h2 id={id} className="flex items-center gap-2 text-base font-semibold">
            <span aria-hidden="true" className="text-info [&_svg]:size-5">
              {icon}
            </span>
            {title}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
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
        </div>
        <div className={cn('flex-1 px-4 pb-4', bodyClassName)}>{children}</div>
      </section>
    </Card>
  );
}

function Metric({
  icon,
  value,
  label,
  tone,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  tone: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className={cn('grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5', tone)}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-lg leading-tight font-bold tabular-nums">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
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
  const [zoneId, setZoneId] = useState('');
  const [search, setSearch] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const canControl = CONTROLLERS.has(user.role);

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
  const energy = useQuery({
    queryKey: ['reports', 'breakdown', 7],
    queryFn: () => api.request<ReportBreakdownDto>('/v1/reports/breakdown', { query: { days: 7 } }),
    enabled: REPORT_READERS.has(user.role),
    refetchInterval: REFRESH_MS * 5,
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
  const kw = (watts: number) => format.number(watts / 1000, { maximumFractionDigits: 2 });
  const kwh = (value: number) => format.number(value, { maximumFractionDigits: 1 });
  const poles = summary.data?.poles;
  const devices = summary.data?.devices;
  const power = summary.data?.power;
  const city = user.tenant?.name ?? '';
  const days = energy.data?.trend ?? [];
  const weekKWh = days.reduce((sum, day) => sum + day.energyKWh, 0);
  const todayKWh = days.at(-1)?.energyKWh ?? 0;
  const loading = !poles || !devices || !power;

  const shownPoles = (mapPoles.data ?? []).filter((pole) => !zoneId || pole.zoneId === zoneId);
  const statusCount = (status: PoleMapItemDto['lightStatus']) =>
    shownPoles.filter((pole) => pole.lightStatus === status).length;
  // Default selection: the first pole with a controller report, so the panel is useful at once.
  const selectedId =
    selected ?? mapPoles.data?.find((pole) => pole.dimPercent !== null)?.id ?? null;

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const query = search.trim().toLowerCase();
    if (!query) return;
    const match =
      mapPoles.data?.find((pole) => pole.code.toLowerCase() === query) ??
      mapPoles.data?.find((pole) => pole.code.toLowerCase().includes(query));
    setNotFound(!match);
    if (match) {
      setZoneId('');
      setSelected(match.id);
    }
  }

  return (
    <>
      <ConsoleHero
        compact
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

      {/* Six headline numbers */}
      <section
        aria-label={t('stats.heading')}
        className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6"
      >
        <StatTile
          tone="blue"
          icon={<Lightbulb />}
          label={t('stats.totalLights')}
          loading={loading}
          value={poles ? format.number(poles.total) : ''}
          note={t('stats.zones', { count: summary.data?.zones.length ?? 0 })}
        />
        <StatTile
          tone="green"
          icon={<Power />}
          label={t('stats.online')}
          loading={loading}
          value={devices ? format.number(devices.online) : ''}
          note={
            devices
              ? t('stats.ofControllers', {
                  percent: percent(share(devices.online, devices.total)),
                  total: format.number(devices.total),
                })
              : null
          }
        />
        <StatTile
          tone="orange"
          icon={<WifiOff />}
          label={t('stats.offline')}
          loading={loading}
          value={poles ? format.number(poles.offline) : ''}
          note={poles ? percent(share(poles.offline, poles.total)) : null}
        />
        <StatTile
          tone="red"
          icon={<Wrench />}
          label={t('stats.faulty')}
          loading={loading}
          value={poles ? format.number(poles.fault) : ''}
          note={poles ? percent(share(poles.fault, poles.total)) : null}
        />
        <StatTile
          tone="purple"
          icon={<Zap />}
          label={t('stats.load')}
          loading={loading}
          value={power ? `${kw(power.currentW)} kW` : ''}
          note={power ? t('stats.loadNote', { count: format.number(power.reporting) }) : null}
        />
        <StatTile
          tone="cyan"
          icon={<Leaf />}
          label={t('stats.energyWeek')}
          loading={energy.isPending && energy.fetchStatus !== 'idle'}
          value={energy.data ? `${kwh(weekKWh)} kWh` : '—'}
          note={energy.data ? t('stats.measured') : t('stats.noReport')}
        />
      </section>

      {/* Map with the selected light */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          id="live-map"
          title={t('map.title')}
          icon={<MapPinned />}
          className="xl:col-span-2"
          bodyClassName="flex flex-col"
          actions={
            <>
              <form onSubmit={onSearch} role="search" className="relative w-full sm:w-56">
                <label htmlFor="map-search" className="sr-only">
                  {t('map.search')}
                </label>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="map-search"
                  type="search"
                  value={search}
                  placeholder={t('map.search')}
                  aria-invalid={notFound}
                  aria-describedby={notFound ? 'map-search-error' : undefined}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setNotFound(false);
                  }}
                  className="h-11 pl-9 text-sm"
                />
              </form>
              <label htmlFor="map-zone" className="sr-only">
                {t('map.zone')}
              </label>
              <Select
                id="map-zone"
                value={zoneId}
                onChange={(event) => setZoneId(event.target.value)}
                className="h-11 w-full text-sm sm:w-44"
              >
                <option value="">{t('map.allZones')}</option>
                {summary.data?.zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </Select>
              <Link
                href="/map"
                aria-label={t('map.openFull')}
                className="grid size-11 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-surface-subtle hover:text-foreground"
              >
                <Maximize2 aria-hidden="true" className="size-4" />
              </Link>
            </>
          }
        >
          {notFound ? (
            <p id="map-search-error" role="alert" className="mb-2 text-sm text-danger">
              {t('map.notFound', { query: search.trim() })}
            </p>
          ) : null}
          {mapPoles.data && mapPoles.data.length > 0 ? (
            <div className="relative min-h-[26rem] flex-1">
              <PoleMap
                poles={shownPoles}
                fitKey={zoneId}
                selectedId={selectedId}
                onSelect={setSelected}
                className="absolute inset-0 h-full min-h-0 overflow-hidden rounded-xl"
                label={tMap('label', { count: shownPoles.length })}
                statusLabel={(status) => tLight(status)}
                openLabel={tMap('open')}
                onOpen={(poleId) => router.push(`/poles/${poleId}`)}
              />
              <ul
                aria-label={t('map.legend')}
                className="absolute bottom-3 left-3 grid gap-1 rounded-lg border border-border bg-surface/90 px-3 py-2 text-xs backdrop-blur"
              >
                {LEGEND.map((item) => (
                  <li key={item.status} className="flex items-center gap-2">
                    <span aria-hidden="true" className={cn('size-2.5 rounded-full', item.dot)} />
                    {tLight(item.status)}
                    <span className="ml-auto pl-2 font-semibold tabular-nums">
                      {format.number(statusCount(item.status))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : mapPoles.isPending ? (
            <Skeleton className="h-[26rem]" />
          ) : (
            <EmptyState
              className="min-h-80"
              icon={<MapPinned />}
              title={t('map.emptyTitle')}
              description={t('map.emptyDescription')}
            />
          )}
        </Panel>

        <Panel id="selected-light" title={t('selected.title')} icon={<Lightbulb />}>
          <SelectedLight poleId={selectedId} canControl={canControl} />
        </Panel>
      </div>

      {/* Energy, status and live metrics */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel id="energy" title={t('energy.title')} icon={<Bolt />}>
          {!REPORT_READERS.has(user.role) ? (
            <p className="text-sm text-muted-foreground">{t('energy.noAccess')}</p>
          ) : energy.error ? (
            <p className="text-sm text-muted-foreground">{tCommon('errorBody')}</p>
          ) : !energy.data ? (
            <Skeleton className="h-48" />
          ) : (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <p className="text-2xl font-bold tabular-nums">{kwh(weekKWh)} kWh</p>
                <p className="text-xs text-muted-foreground">{t('energy.week')}</p>
              </div>
              <EnergyBars days={days} />
              <p className="text-xs text-muted-foreground">
                {t('energy.note', { count: energy.data.dataSources.controllersReporting })}
              </p>
            </div>
          )}
        </Panel>

        <Panel id="light-status" title={t('status.title')} icon={<Activity />}>
          {poles ? (
            <StatusDonut
              centreValue={format.number(poles.total)}
              centreLabel={t('status.total')}
              totalLabel={t('overview.total')}
              slices={[
                {
                  key: 'on',
                  label: tLight('ON'),
                  value: poles.on,
                  strokeClass: 'stroke-success',
                  dotClass: 'bg-success',
                },
                {
                  key: 'dimmed',
                  label: tLight('DIMMED'),
                  value: poles.dimmed,
                  strokeClass: 'stroke-info',
                  dotClass: 'bg-info',
                },
                {
                  key: 'off',
                  label: tLight('OFF'),
                  value: poles.off,
                  strokeClass: 'stroke-neutral',
                  dotClass: 'bg-neutral',
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
                  strokeClass: 'stroke-warning',
                  dotClass: 'bg-warning',
                },
                {
                  key: 'unknown',
                  label: tLight('UNKNOWN'),
                  value: poles.unknown,
                  strokeClass: 'stroke-neutral/30',
                  dotClass: 'bg-neutral/30',
                },
              ]}
            />
          ) : (
            <Skeleton className="h-44" />
          )}
        </Panel>

        <Panel
          id="realtime"
          title={t('metrics.title')}
          icon={<Radio />}
          className="lg:col-span-2 xl:col-span-1"
        >
          {loading ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              <Metric
                icon={<Zap />}
                tone="bg-warning-subtle text-warning"
                value={`${kw(power.currentW)} kW`}
                label={t('metrics.load')}
              />
              <Metric
                icon={<Gauge />}
                tone="bg-primary-subtle text-info"
                value={`${format.number(power.reporting)} / ${format.number(devices.total)}`}
                label={t('metrics.reporting')}
              />
              <Metric
                icon={<Lightbulb />}
                tone="bg-success-subtle text-success"
                value={format.number(poles.on + poles.dimmed)}
                label={t('metrics.lit')}
              />
              <Metric
                icon={<SunDim />}
                tone="bg-info-subtle text-info"
                value={format.number(poles.dimmed)}
                label={t('metrics.dimmed')}
              />
              <Metric
                icon={<Bolt />}
                tone="bg-primary-subtle text-info"
                value={energy.data ? `${kwh(todayKWh)} kWh` : '—'}
                label={t('metrics.energyToday')}
              />
              <Metric
                icon={<CircleCheck />}
                tone="bg-success-subtle text-success"
                value={percent(share(poles.working, poles.total))}
                label={t('metrics.working')}
              />
            </div>
          )}
        </Panel>
      </div>

      {/* Alerts, open work and automation */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel
          id="recent-alerts"
          title={t('events.title')}
          icon={<TriangleAlert />}
          link={{ href: '/alerts', label: t('events.viewAll') }}
          bodyClassName="px-0"
        >
          {events.data ? (
            events.data.items.length === 0 ? (
              <p className="px-4 text-sm text-muted-foreground">{t('events.empty')}</p>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[22rem] text-left text-xs">
                  <caption className="sr-only">{t('events.title')}</caption>
                  <thead className="bg-surface-subtle text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2 pr-2 pl-4 font-medium">
                        {t('events.columns.time')}
                      </th>
                      <th scope="col" className="px-2 py-2 font-medium">
                        {t('events.columns.pole')}
                      </th>
                      <th scope="col" className="px-2 py-2 font-medium">
                        {t('events.columns.type')}
                      </th>
                      <th scope="col" className="py-2 pr-4 pl-2 font-medium">
                        {t('events.columns.status')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {events.data.items.map((event) => {
                      const fixed = event.resolvedAt !== null;
                      return (
                        <tr key={event.id} className="hover:bg-surface-subtle/60">
                          <td className="py-2 pr-2 pl-4 whitespace-nowrap text-muted-foreground">
                            <time dateTime={event.receivedAt}>
                              {format.dateTime(new Date(event.receivedAt), { timeStyle: 'short' })}
                            </time>
                          </td>
                          <th scope="row" className="px-2 py-2 font-mono font-medium">
                            {event.pole ? (
                              <Link
                                href={`/poles/${event.pole.id}`}
                                className="text-primary hover:underline"
                              >
                                {event.pole.code}
                              </Link>
                            ) : (
                              event.deviceId
                            )}
                          </th>
                          <td
                            className={cn(
                              'px-2 py-2',
                              fixed
                                ? 'text-foreground'
                                : event.severity === 'critical'
                                  ? 'text-danger'
                                  : event.severity === 'warning'
                                    ? 'text-warning'
                                    : 'text-info',
                            )}
                          >
                            {event.type === 'boot' ? t('events.boot') : faultLabel(event.type)}
                          </td>
                          <td className="py-2 pr-4 pl-2">
                            <span
                              className={cn(
                                'inline-flex rounded-md px-2 py-0.5 text-xs font-semibold',
                                fixed
                                  ? 'bg-success-subtle text-success'
                                  : 'bg-danger-subtle text-danger',
                              )}
                            >
                              {fixed ? t('events.resolved') : t('events.open')}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : events.error ? (
            <p className="px-4 text-sm text-muted-foreground">{t('events.noAccess')}</p>
          ) : (
            <Skeleton className="mx-4 h-48" />
          )}
        </Panel>

        <Panel
          id="open-work"
          title={t('openWork.title')}
          icon={<Wrench />}
          link={{ href: '/work-orders', label: t('openWork.viewAll') }}
          bodyClassName="px-0"
        >
          {urgent.data ? (
            urgent.data.items.length === 0 ? (
              <div className="px-4">
                <EmptyState icon={<CircleCheck />} title={t('openWork.empty')} />
              </div>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[24rem] text-left text-xs">
                  <caption className="sr-only">{t('openWork.title')}</caption>
                  <thead className="bg-surface-subtle text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2 pr-2 pl-4 font-medium">
                        {t('openWork.columns.pole')}
                      </th>
                      <th scope="col" className="px-2 py-2 font-medium">
                        {t('openWork.columns.issue')}
                      </th>
                      <th scope="col" className="px-2 py-2 font-medium">
                        {t('openWork.columns.priority')}
                      </th>
                      <th scope="col" className="py-2 pr-4 pl-2 font-medium">
                        {t('openWork.columns.deadline')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {urgent.data.items.map((workOrder) => (
                      <tr key={workOrder.id} className="hover:bg-surface-subtle/60">
                        <th scope="row" className="py-2 pr-2 pl-4 font-normal">
                          <Link
                            href={`/work-orders/${workOrder.id}`}
                            className="font-mono font-medium text-primary hover:underline"
                          >
                            {workOrder.pole.code}
                          </Link>
                          <span className="block max-w-[10rem] truncate text-xs text-muted-foreground">
                            {workOrder.pole.zoneName ?? workOrder.number}
                          </span>
                        </th>
                        <td className="px-2 py-2">{faultLabel(workOrder.faultType)}</td>
                        <td className="px-2 py-2">
                          <PriorityBadge priority={workOrder.priority} />
                        </td>
                        <td className="py-2 pr-4 pl-2 text-xs">
                          <DeadlineLabel dueAt={workOrder.slaDueAt} overdue={workOrder.overdue} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : urgent.error ? (
            <p className="px-4 text-sm text-muted-foreground">{tCommon('errorBody')}</p>
          ) : (
            <Skeleton className="mx-4 h-48" />
          )}
        </Panel>

        <Panel
          id="automation"
          title={t('automation.title')}
          icon={<CalendarClock />}
          link={{ href: '/schedules', label: t('automation.manage') }}
          className="lg:col-span-2 xl:col-span-1"
        >
          <AutomationPanel />
        </Panel>
      </div>

      {/* Controller history and streets */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          id="activity"
          title={t('activity.title')}
          icon={<BarChart3 />}
          className="xl:col-span-3"
          actions={
            <div role="group" aria-label={t('activity.range')} className="flex gap-1">
              {DASHBOARD_RANGES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={range === value}
                  onClick={() => setRange(value)}
                  className={cn(
                    'min-h-11 min-w-12 rounded-lg px-3 text-sm font-semibold transition-colors',
                    range === value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-surface-subtle',
                  )}
                >
                  {t(`activity.ranges.${value}`)}
                </button>
              ))}
            </div>
          }
        >
          {activity.data ? (
            <ActivityChart data={activity.data} />
          ) : activity.error ? (
            <p className="text-sm text-muted-foreground">{tCommon('errorBody')}</p>
          ) : (
            <Skeleton className="h-60" />
          )}
        </Panel>
      </div>

      <Panel
        id="zone-streets"
        title={t('zones.title')}
        icon={<MapPinned />}
        link={{ href: '/streets', label: t('zones.openStreets') }}
        className="mt-4"
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

      <p className="mt-4 text-xs text-muted-foreground">
        {t('updated', {
          time: format.dateTime(now, { dateStyle: 'medium', timeStyle: 'short' }),
        })}
      </p>
    </>
  );
}
