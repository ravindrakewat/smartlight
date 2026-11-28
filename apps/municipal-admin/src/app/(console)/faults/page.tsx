'use client';

import type {
  DashboardSummaryDto,
  DeviceEventDto,
  ReportBreakdownDto,
  ReportSummaryDto,
  WorkOrderSummaryDto,
} from '@smart-light/shared';
import { Alert, cn, EmptyState, Panel, Skeleton, StatTile } from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  CircleCheck,
  ClipboardList,
  MapPinned,
  Siren,
  TriangleAlert,
  WifiOff,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { DeadlineLabel, PriorityBadge, useFaultLabel } from '@/components/labels';
import { useSessionUser } from '@/components/Session';
import { ConsoleHero } from '@/components/shell/ConsoleHero';
import { api } from '@/lib/api';

const REFRESH_MS = 60_000;
/** Fault statistics come from the reports, which these roles may read. */
const REPORT_READERS = new Set(['SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'SUPERVISOR', 'OPERATOR']);
/** Period of the fault-type and ward tables. */
const DAYS = 30;
const WARD_ROWS = 8;

const SEVERITY_TEXT: Record<DeviceEventDto['severity'], string> = {
  critical: 'bg-danger-subtle text-danger',
  warning: 'bg-warning-subtle text-warning',
  info: 'bg-info-subtle text-info',
};

export default function FaultsPage() {
  const t = useTranslations('Faults');
  const tAlerts = useTranslations('Lighting.alerts');
  const tWork = useTranslations('Dashboard.openWork');
  const tCommon = useTranslations('Common');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const faultLabel = useFaultLabel();
  const user = useSessionUser();
  const reports = REPORT_READERS.has(user.role);

  const live = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.request<DashboardSummaryDto>('/v1/dashboard/summary'),
    refetchInterval: REFRESH_MS,
  });
  const summary = useQuery({
    queryKey: ['reports', 'summary', DAYS],
    queryFn: () => api.request<ReportSummaryDto>('/v1/reports/summary', { query: { days: DAYS } }),
    enabled: reports,
  });
  const breakdown = useQuery({
    queryKey: ['reports', 'breakdown', DAYS],
    queryFn: () =>
      api.request<ReportBreakdownDto>('/v1/reports/breakdown', { query: { days: DAYS } }),
    enabled: reports,
  });
  const critical = useQuery({
    queryKey: ['alerts', 'open-count', 'critical'],
    queryFn: () =>
      api.page<DeviceEventDto>('/v1/alerts', { query: { severity: 'critical', pageSize: 1 } }),
    refetchInterval: REFRESH_MS,
    retry: false,
  });
  const alerts = useQuery({
    queryKey: ['alerts', 'faults-open'],
    queryFn: () => api.page<DeviceEventDto>('/v1/alerts', { query: { pageSize: 8 } }),
    refetchInterval: REFRESH_MS,
    retry: false,
  });
  const work = useQuery({
    queryKey: ['work-orders', 'urgent'],
    queryFn: () =>
      api.page<WorkOrderSummaryDto>('/v1/work-orders', { query: { open: true, pageSize: 5 } }),
    refetchInterval: REFRESH_MS,
  });

  const poles = live.data?.poles;
  const workOrders = summary.data?.workOrders;
  const faults = [...(breakdown.data?.faults ?? [])].sort((a, b) => b.count - a.count);
  const faultPeak = faults[0]?.count ?? 0;
  const wards = [...(breakdown.data?.wards ?? [])]
    .filter((ward) => ward.faulty + ward.offline + ward.open > 0)
    .sort((a, b) => b.faulty - a.faulty || b.offline - a.offline || b.open - a.open)
    .slice(0, WARD_ROWS);
  const percent = (part: number, whole: number) =>
    format.number(whole === 0 ? 0 : part / whole, { style: 'percent', maximumFractionDigits: 1 });

  return (
    <>
      <ConsoleHero title={t('title')} description={t('description')} icon={<Siren />} />

      {live.error ? (
        <Alert tone="danger" title={tCommon('errorTitle')} className="mb-4">
          {tCommon('errorBody')}
        </Alert>
      ) : null}

      <section aria-label={t('tiles.heading')} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          tone="red"
          icon={<Wrench />}
          label={t('tiles.faulty')}
          loading={!poles}
          value={poles ? format.number(poles.fault) : ''}
          note={poles ? percent(poles.fault, poles.total) : null}
        />
        <StatTile
          tone="orange"
          icon={<WifiOff />}
          label={t('tiles.offline')}
          loading={!poles}
          value={poles ? format.number(poles.offline) : ''}
          note={poles ? percent(poles.offline, poles.total) : null}
        />
        <StatTile
          tone="purple"
          icon={<TriangleAlert />}
          label={t('tiles.critical')}
          loading={critical.isPending}
          value={critical.data ? format.number(critical.data.pagination.totalItems) : '—'}
          note={t('tiles.open')}
        />
        <StatTile
          tone="blue"
          icon={<ClipboardList />}
          label={t('tiles.overdue')}
          loading={reports && summary.isPending}
          value={workOrders ? format.number(workOrders.overdueNow) : '—'}
          note={
            workOrders ? t('tiles.openRepairs', { count: format.number(workOrders.openNow) }) : null
          }
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          id="fault-alerts"
          title={t('alerts.title')}
          icon={<Bell />}
          link={{ href: '/alerts', label: t('alerts.viewAll') }}
          bodyClassName="px-0"
        >
          {alerts.data ? (
            alerts.data.items.length === 0 ? (
              <div className="px-4">
                <EmptyState icon={<CircleCheck />} title={tAlerts('empty')} />
              </div>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[24rem] text-left text-xs">
                  <caption className="sr-only">{t('alerts.title')}</caption>
                  <thead className="bg-surface-subtle text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2 pr-2 pl-4 font-medium">
                        {tAlerts('columns.pole')}
                      </th>
                      <th scope="col" className="px-2 py-2 font-medium">
                        {tAlerts('columns.alert')}
                      </th>
                      <th scope="col" className="px-2 py-2 font-medium">
                        {tAlerts('severity')}
                      </th>
                      <th scope="col" className="py-2 pr-4 pl-2 font-medium">
                        {tAlerts('columns.when')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {alerts.data.items.map((event) => (
                      <tr key={event.id} className="hover:bg-surface-subtle/60">
                        <th scope="row" className="py-2 pr-2 pl-4 font-mono font-medium">
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
                        <td className="px-2 py-2">{faultLabel(event.type)}</td>
                        <td className="px-2 py-2">
                          <span
                            className={cn(
                              'inline-flex rounded-md px-2 py-0.5 font-semibold',
                              SEVERITY_TEXT[event.severity],
                            )}
                          >
                            {tAlerts(`severities.${event.severity}`)}
                          </span>
                        </td>
                        <td className="py-2 pr-4 pl-2 whitespace-nowrap text-muted-foreground">
                          <time dateTime={event.receivedAt}>
                            {format.relativeTime(new Date(event.receivedAt), now)}
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : alerts.error ? (
            <p className="px-4 text-sm text-muted-foreground">{t('noAccess')}</p>
          ) : (
            <Skeleton className="mx-4 h-48" />
          )}
        </Panel>

        <Panel
          id="fault-repairs"
          title={t('repairs.title')}
          icon={<Wrench />}
          link={{ href: '/work-orders', label: t('repairs.viewAll') }}
          bodyClassName="px-0"
        >
          {work.data ? (
            work.data.items.length === 0 ? (
              <div className="px-4">
                <EmptyState icon={<CircleCheck />} title={tWork('empty')} />
              </div>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[24rem] text-left text-xs">
                  <caption className="sr-only">{t('repairs.title')}</caption>
                  <thead className="bg-surface-subtle text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2 pr-2 pl-4 font-medium">
                        {tWork('columns.pole')}
                      </th>
                      <th scope="col" className="px-2 py-2 font-medium">
                        {tWork('columns.issue')}
                      </th>
                      <th scope="col" className="px-2 py-2 font-medium">
                        {tWork('columns.priority')}
                      </th>
                      <th scope="col" className="py-2 pr-4 pl-2 font-medium">
                        {tWork('columns.deadline')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {work.data.items.map((workOrder) => (
                      <tr key={workOrder.id} className="hover:bg-surface-subtle/60">
                        <th scope="row" className="py-2 pr-2 pl-4 font-normal">
                          <Link
                            href={`/work-orders/${workOrder.id}`}
                            className="font-mono font-medium text-primary hover:underline"
                          >
                            {workOrder.pole.code}
                          </Link>
                          <span className="block max-w-[10rem] truncate text-muted-foreground">
                            {workOrder.number}
                          </span>
                        </th>
                        <td className="px-2 py-2">{faultLabel(workOrder.faultType)}</td>
                        <td className="px-2 py-2">
                          <PriorityBadge priority={workOrder.priority} />
                        </td>
                        <td className="py-2 pr-4 pl-2">
                          <DeadlineLabel dueAt={workOrder.slaDueAt} overdue={workOrder.overdue} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : work.error ? (
            <p className="px-4 text-sm text-muted-foreground">{tCommon('errorBody')}</p>
          ) : (
            <Skeleton className="mx-4 h-48" />
          )}
        </Panel>
      </div>

      {reports ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel id="fault-types" title={t('types.title')} icon={<BarChart3 />}>
            {breakdown.data ? (
              faults.length === 0 ? (
                <EmptyState icon={<CircleCheck />} title={t('types.empty')} />
              ) : (
                <ul className="grid gap-3" aria-label={t('types.title')}>
                  {faults.map((fault) => (
                    <li key={fault.faultType} className="grid gap-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span>{faultLabel(fault.faultType)}</span>
                        <span className="font-semibold tabular-nums">
                          {format.number(fault.count)}
                        </span>
                      </div>
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 100 4"
                        preserveAspectRatio="none"
                        className="h-2 w-full"
                      >
                        <rect width="100" height="4" rx="2" className="fill-surface-subtle" />
                        <rect
                          width={faultPeak > 0 ? Math.max(2, (fault.count / faultPeak) * 100) : 0}
                          height="4"
                          rx="2"
                          className="fill-danger"
                        />
                      </svg>
                    </li>
                  ))}
                </ul>
              )
            ) : breakdown.error ? (
              <p className="text-sm text-muted-foreground">{tCommon('errorBody')}</p>
            ) : (
              <Skeleton className="h-48" />
            )}
            <p className="mt-3 text-xs text-muted-foreground">{t('types.note')}</p>
          </Panel>

          <Panel
            id="fault-wards"
            title={t('wards.title')}
            icon={<MapPinned />}
            link={{ href: `/reports?days=${DAYS}`, label: t('wards.viewAll') }}
            bodyClassName="px-0"
          >
            {breakdown.data ? (
              wards.length === 0 ? (
                <div className="px-4">
                  <EmptyState icon={<CircleCheck />} title={t('wards.empty')} />
                </div>
              ) : (
                <div className="relative overflow-x-auto">
                  <table className="w-full min-w-[24rem] text-left text-xs">
                    <caption className="sr-only">{t('wards.title')}</caption>
                    <thead className="bg-surface-subtle text-muted-foreground">
                      <tr>
                        <th scope="col" className="py-2 pr-2 pl-4 font-medium">
                          {t('wards.ward')}
                        </th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">
                          {t('wards.faulty')}
                        </th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">
                          {t('wards.offline')}
                        </th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">
                          {t('wards.open')}
                        </th>
                        <th scope="col" className="py-2 pr-4 pl-2 text-right font-medium">
                          {t('wards.overdue')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {wards.map((ward) => (
                        <tr key={ward.wardId ?? ward.name ?? 'none'}>
                          <th scope="row" className="py-2 pr-2 pl-4 font-normal">
                            {ward.name ?? t('wards.noWard')}
                          </th>
                          <td className="px-2 py-2 text-right font-semibold text-danger tabular-nums">
                            {format.number(ward.faulty)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {format.number(ward.offline)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {format.number(ward.open)}
                          </td>
                          <td className="py-2 pr-4 pl-2 text-right tabular-nums">
                            {format.number(ward.overdue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : breakdown.error ? (
              <p className="px-4 text-sm text-muted-foreground">{tCommon('errorBody')}</p>
            ) : (
              <Skeleton className="mx-4 h-48" />
            )}
          </Panel>
        </div>
      ) : null}
    </>
  );
}
