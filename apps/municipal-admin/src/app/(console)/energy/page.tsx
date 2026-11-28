'use client';

import type { DashboardSummaryDto } from '@smart-light/shared';
import { Alert, Button, EmptyState, Select, Skeleton } from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarDays, FileBarChart, Gauge, Radio, TrendingUp, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { Suspense, useId } from 'react';
import { EnergyBars } from '@/components/dashboard/EnergyBars';
import { Panel } from '@/components/dashboard/Panel';
import { StatTile } from '@/components/dashboard/StatTile';
import { parseDays, useReport } from '@/components/reports/useReport';
import { useSessionUser } from '@/components/Session';
import { ConsoleHero } from '@/components/shell/ConsoleHero';
import { api } from '@/lib/api';

/** Periods offered here: a week and a month by day, a year by month. */
const PERIODS = [7, 30, 365] as const;
/** Roles that may read reports. */
const REPORT_READERS = new Set(['SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'SUPERVISOR', 'OPERATOR']);

function EnergyContent() {
  const t = useTranslations('Energy');
  const tReports = useTranslations('Reports');
  const tCommon = useTranslations('Common');
  const format = useFormatter();
  const router = useRouter();
  const params = useSearchParams();
  const user = useSessionUser();
  const periodId = useId();
  const days = parseDays(params.get('days'), PERIODS);
  const allowed = REPORT_READERS.has(user.role);

  const report = useReport(days);
  const live = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.request<DashboardSummaryDto>('/v1/dashboard/summary'),
    refetchInterval: 60_000,
    enabled: allowed,
  });

  const kwh = (value: number) => format.number(value, { maximumFractionDigits: 1 });
  const breakdown = report.breakdown;
  const summary = report.summary;
  const trend = breakdown?.trend ?? [];
  const total = summary?.energy.kWh ?? 0;
  const monthly = breakdown?.bucket === 'month';
  const bucketLabel = (date: string) =>
    format.dateTime(
      new Date(`${date}T12:00:00+05:30`),
      monthly ? { month: 'long', year: 'numeric' } : { dateStyle: 'medium' },
    );
  const peak = trend.reduce<(typeof trend)[number] | null>(
    (best, row) => (best === null || row.energyKWh > best.energyKWh ? row : best),
    null,
  );
  const power = live.data?.power;
  const sources = breakdown?.dataSources;

  if (!allowed) {
    return (
      <>
        <ConsoleHero title={t('title')} description={t('description')} icon={<Zap />} />
        <EmptyState icon={<Zap />} title={t('noAccess')} />
      </>
    );
  }

  return (
    <>
      <ConsoleHero
        title={t('title')}
        description={t('description')}
        icon={<Zap />}
        actions={
          <>
            <div className="flex items-center gap-2">
              <label htmlFor={periodId} className="text-sm font-medium">
                {tReports('period')}
              </label>
              <Select
                id={periodId}
                value={String(days)}
                onChange={(event) => router.replace(`/energy?days=${event.target.value}`)}
              >
                {PERIODS.map((period) => (
                  <option key={period} value={period}>
                    {tReports('lastDays', { days: period })}
                  </option>
                ))}
              </Select>
            </div>
            <Button asChild variant="outline">
              <Link href={`/reports?days=${days}`}>
                <FileBarChart aria-hidden="true" />
                {t('fullReport')}
              </Link>
            </Button>
          </>
        }
      />

      {sources && sources.simulatedControllersReporting > 0 ? (
        <Alert tone="warning" title={tReports('simulatedTitle')} className="mb-4">
          {tReports('simulatedBody', {
            simulated: sources.simulatedControllersReporting,
            total: sources.controllersReporting,
          })}
        </Alert>
      ) : null}

      {report.isError ? (
        <Alert tone="danger" title={tCommon('errorTitle')} className="mb-4">
          <p>{tCommon('errorBody')}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={report.refetch}>
            {tCommon('retry')}
          </Button>
        </Alert>
      ) : null}

      <section
        aria-label={t('tiles.heading')}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-busy={report.isFetching}
      >
        <StatTile
          tone="cyan"
          icon={<Zap />}
          label={t('tiles.total')}
          loading={!summary}
          value={kwh(total)}
          unit="kWh"
          note={tReports('lastDays', { days })}
        />
        <StatTile
          tone="blue"
          icon={<CalendarDays />}
          label={t('tiles.average')}
          loading={!summary}
          value={kwh(total / days)}
          unit="kWh"
          note={t('tiles.perDay')}
        />
        <StatTile
          tone="purple"
          icon={<Gauge />}
          label={t('tiles.load')}
          loading={live.isPending}
          value={power ? format.number(power.currentW / 1000, { maximumFractionDigits: 2 }) : '—'}
          unit={power ? 'kW' : undefined}
          note={power ? t('tiles.loadNote', { count: format.number(power.reporting) }) : null}
        />
        <StatTile
          tone="green"
          icon={<Radio />}
          label={t('tiles.reporting')}
          loading={!summary}
          value={format.number(summary?.energy.controllersReporting ?? 0)}
          note={
            summary
              ? t('tiles.ofControllers', { total: format.number(summary.poles.controllers) })
              : null
          }
        />
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          id="energy-chart"
          title={monthly ? t('chart.monthly') : t('chart.daily')}
          icon={<BarChart3 />}
          className="xl:col-span-2"
        >
          {!breakdown ? (
            <Skeleton className="h-56" />
          ) : total === 0 ? (
            <EmptyState icon={<Zap />} title={t('empty')} />
          ) : (
            <div className="grid gap-3">
              <EnergyBars
                days={trend}
                bucket={breakdown.bucket}
                caption={monthly ? t('chart.monthly') : t('chart.daily')}
              />
              <p className="text-xs text-muted-foreground">{t('note')}</p>
            </div>
          )}
        </Panel>

        <Panel id="energy-highlights" title={t('highlights.title')} icon={<TrendingUp />}>
          {!breakdown || !summary ? (
            <Skeleton className="h-40" />
          ) : (
            <dl className="grid gap-3 text-sm">
              <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
                <dt className="text-muted-foreground">
                  {monthly ? t('highlights.peakMonth') : t('highlights.peakDay')}
                </dt>
                <dd className="text-right font-semibold tabular-nums">
                  {peak && peak.energyKWh > 0
                    ? `${kwh(peak.energyKWh)} kWh · ${bucketLabel(peak.date)}`
                    : '—'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
                <dt className="text-muted-foreground">{t('highlights.perController')}</dt>
                <dd className="text-right font-semibold tabular-nums">
                  {summary.energy.controllersReporting > 0
                    ? `${kwh(total / summary.energy.controllersReporting)} kWh`
                    : '—'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t('highlights.savings')}</dt>
                <dd className="text-right text-muted-foreground">{t('highlights.noBaseline')}</dd>
              </div>
            </dl>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel
          id="energy-table"
          title={monthly ? t('table.monthly') : t('table.daily')}
          icon={<CalendarDays />}
          bodyClassName="px-0"
        >
          {!breakdown ? (
            <Skeleton className="mx-4 h-48" />
          ) : (
            <div className="relative max-h-[28rem] overflow-auto">
              <table className="w-full min-w-[20rem] text-left text-sm">
                <caption className="sr-only">
                  {monthly ? t('table.monthly') : t('table.daily')}
                </caption>
                <thead className="sticky top-0 bg-surface-subtle text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-2 pl-4 font-medium">
                      {monthly ? t('table.month') : t('table.date')}
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      {t('table.kwh')}
                    </th>
                    <th scope="col" className="py-2 pr-4 pl-2 text-right font-medium">
                      {t('table.share')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...trend].reverse().map((row) => (
                    <tr key={row.date}>
                      <th scope="row" className="py-2 pr-2 pl-4 font-normal">
                        {bucketLabel(row.date)}
                      </th>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">
                        {kwh(row.energyKWh)}
                      </td>
                      <td className="py-2 pr-4 pl-2 text-right text-muted-foreground tabular-nums">
                        {total > 0
                          ? format.number(row.energyKWh / total, {
                              style: 'percent',
                              maximumFractionDigits: 1,
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

export default function EnergyPage() {
  return (
    <Suspense>
      <EnergyContent />
    </Suspense>
  );
}
