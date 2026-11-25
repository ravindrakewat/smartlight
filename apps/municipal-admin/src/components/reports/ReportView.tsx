'use client';

import type { ReportBreakdownDto, ReportSummaryDto } from '@smart-light/shared';
import { Button, Card, cn, KpiCard } from '@smart-light/ui';
import { CircleCheck, Clock, Download, MessageSquareWarning, Wrench, Zap } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useFaultLabel } from '@/components/labels';
import { downloadCsv } from '@/lib/csv';

type Performance = ReportBreakdownDto['technicians'][number];

interface ReportViewProps {
  summary: ReportSummaryDto;
  breakdown: ReportBreakdownDto;
  days: number;
  /** Print layout: no download buttons, tables never scroll. */
  printable?: boolean;
}

function useNumbers() {
  const format = useFormatter();
  return {
    int: (value: number) => format.number(value),
    one: (value: number) => format.number(value, { maximumFractionDigits: 1 }),
    pct: (value: number | null) =>
      value === null ? '—' : format.number(value, { style: 'percent', maximumFractionDigits: 0 }),
    hours: (value: number | null) =>
      value === null ? '—' : format.number(value, { maximumFractionDigits: 1 }),
  };
}

const share = (part: number, whole: number) => (whole > 0 ? part / whole : null);

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden break-inside-avoid print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function CsvButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="print:hidden">
      <Download aria-hidden="true" />
      {label}
    </Button>
  );
}

/** Single-series bars, one per bucket; values on hover and in the table under it. */
function TrendBars({
  title,
  points,
  value,
  label,
  formatValue,
  tone,
}: {
  title: string;
  points: ReportBreakdownDto['trend'];
  value: (point: ReportBreakdownDto['trend'][number]) => number;
  label: (date: string) => string;
  formatValue: (value: number) => string;
  tone: 'primary' | 'brand';
}) {
  const max = Math.max(...points.map(value), 0);
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground tabular-nums">
          {formatValue(points.reduce((sum, point) => sum + value(point), 0))}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${points.length * 10} 100`}
        preserveAspectRatio="none"
        className="h-28 w-full border-b border-border"
        aria-hidden="true"
      >
        {points.map((point, index) => {
          const amount = value(point);
          const height = max > 0 && amount > 0 ? Math.max(2, (amount / max) * 100) : 0;
          return (
            <g key={point.date}>
              <title>{`${label(point.date)}: ${formatValue(amount)}`}</title>
              {/* Full-height hit area so small bars are easy to hover. */}
              <rect x={index * 10} y={0} width={10} height={100} className="fill-transparent" />
              <rect
                x={index * 10 + 1}
                y={100 - height}
                width={8}
                height={height}
                rx={1}
                className={tone === 'primary' ? 'fill-primary' : 'fill-brand'}
              />
            </g>
          );
        })}
      </svg>
      {/* First, middle and last date only, so labels never collide. */}
      <div
        className="mt-1 flex justify-between gap-2 text-[11px] whitespace-nowrap text-muted-foreground"
        aria-hidden="true"
      >
        {[0, Math.floor((points.length - 1) / 2), points.length - 1]
          .filter((index, position, list) => index >= 0 && list.indexOf(index) === position)
          .map((index) => (
            <span key={index}>{points[index] ? label(points[index].date) : ''}</span>
          ))}
      </div>
    </figure>
  );
}

function Th({ children, end }: { children: ReactNode; end?: boolean }) {
  return (
    <th
      scope="col"
      className={cn('px-3 py-2.5 font-medium first:pl-5 last:pr-5', end && 'text-right')}
    >
      {children}
    </th>
  );
}

function Td({ children, end }: { children: ReactNode; end?: boolean }) {
  return (
    <td className={cn('px-3 py-2.5 first:pl-5 last:pr-5', end && 'text-right tabular-nums')}>
      {children}
    </td>
  );
}

function Table({
  head,
  children,
  printable,
  minWidth = 'min-w-[40rem]',
}: {
  head: ReactNode;
  children: ReactNode;
  printable?: boolean;
  minWidth?: string;
}) {
  return (
    <div className={cn(!printable && 'overflow-x-auto')}>
      <table className={cn('w-full text-left text-sm', !printable && minWidth)}>
        <thead className="bg-surface-subtle/60 text-muted-foreground">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-6 text-center text-muted-foreground">
        {text}
      </td>
    </tr>
  );
}

export function ReportView({ summary, breakdown, days, printable }: ReportViewProps) {
  const t = useTranslations('Reports');
  const format = useFormatter();
  const n = useNumbers();
  const faultLabel = useFaultLabel();
  const stamp = breakdown.to.slice(0, 10);

  const dateLabel = (date: string) =>
    breakdown.bucket === 'month'
      ? format.dateTime(new Date(`${date}T00:00:00+05:30`), { month: 'short', year: '2-digit' })
      : format.dateTime(new Date(`${date}T00:00:00+05:30`), { day: 'numeric', month: 'short' });

  const performanceHead = (
    <>
      <Th end>{t('columns.open')}</Th>
      <Th end>{t('columns.overdue')}</Th>
      <Th end>{t('columns.resolved')}</Th>
      <Th end>{t('columns.withinSla')}</Th>
      <Th end>{t('columns.avgHours')}</Th>
    </>
  );
  const performanceCells = (row: Omit<Performance, 'id' | 'name' | 'agency'>) => (
    <>
      <Td end>{n.int(row.open)}</Td>
      <Td end>
        <span className={cn(row.overdue > 0 && 'font-semibold text-danger')}>
          {n.int(row.overdue)}
        </span>
      </Td>
      <Td end>{n.int(row.resolved)}</Td>
      <Td end>{n.pct(share(row.resolvedWithinSla, row.resolved))}</Td>
      <Td end>{n.hours(row.averageRepairHours)}</Td>
    </>
  );
  const performanceCsvHead = [
    'open',
    'overdue',
    'resolved',
    'resolved_within_sla',
    'avg_repair_hours',
  ];
  const performanceCsv = (row: Omit<Performance, 'id' | 'name' | 'agency'>) => [
    row.open,
    row.overdue,
    row.resolved,
    row.resolvedWithinSla,
    row.averageRepairHours,
  ];

  const wardName = (row: ReportBreakdownDto['wards'][number]) =>
    !row.name
      ? t('noWard')
      : row.code && !row.name.includes(row.code)
        ? `${row.name} (${row.code})`
        : row.name;

  const { workOrders, complaints, energy, poles } = summary;
  const maxFault = Math.max(...breakdown.faults.map((row) => row.count), 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-3">
        <KpiCard
          label={t('kpi.sla')}
          value={n.pct(workOrders.slaCompliance)}
          icon={<CircleCheck />}
          tone="success"
          hint={t('kpi.slaHint', {
            within: workOrders.resolvedWithinSla,
            resolved: workOrders.resolved,
          })}
          share={workOrders.slaCompliance}
        />
        <KpiCard
          label={t('kpi.repairTime')}
          value={
            workOrders.averageRepairHours === null
              ? '—'
              : t('hoursValue', { hours: n.hours(workOrders.averageRepairHours) })
          }
          icon={<Clock />}
          tone="info"
          hint={t('kpi.repairTimeHint')}
        />
        <KpiCard
          label={t('kpi.workOrders')}
          value={t('kpi.workOrdersValue', {
            created: workOrders.created,
            resolved: workOrders.resolved,
          })}
          icon={<Wrench />}
          tone={workOrders.overdueNow > 0 ? 'danger' : 'neutral'}
          hint={t('kpi.workOrdersHint', {
            open: workOrders.openNow,
            overdue: workOrders.overdueNow,
          })}
        />
        <KpiCard
          label={t('kpi.complaints')}
          value={t('kpi.complaintsValue', {
            received: complaints.received,
            resolved: complaints.resolved,
          })}
          icon={<MessageSquareWarning />}
          tone="warning"
          hint={t('kpi.complaintsHint')}
        />
        <KpiCard
          label={t('kpi.energy')}
          value={t('kwhValue', { kwh: n.one(energy.kWh) })}
          icon={<Zap />}
          tone="warning"
          hint={t('kpi.energyHint', { controllers: energy.controllersReporting })}
        />
        <KpiCard
          label={t('kpi.availability')}
          value={n.pct(share(poles.workingNow, poles.total))}
          icon={<CircleCheck />}
          tone="success"
          hint={t('kpi.availabilityHint', {
            working: poles.workingNow,
            total: poles.total,
            online: poles.controllersOnline,
            controllers: poles.controllers,
          })}
          share={share(poles.workingNow, poles.total)}
        />
      </div>

      <Section
        title={t('trend.title')}
        description={t(breakdown.bucket === 'month' ? 'trend.monthly' : 'trend.daily')}
        action={
          printable ? null : (
            <CsvButton
              label={t('downloadCsv')}
              onClick={() =>
                downloadCsv(`report-trend-${days}d-${stamp}.csv`, [
                  [
                    'date',
                    'work_orders_created',
                    'work_orders_resolved',
                    'complaints',
                    'energy_kwh_measured',
                  ],
                  ...breakdown.trend.map((point) => [
                    point.date,
                    point.workOrdersCreated,
                    point.workOrdersResolved,
                    point.complaints,
                    point.energyKWh,
                  ]),
                ])
              }
            />
          )
        }
      >
        <div className="grid gap-6 p-5 md:grid-cols-2 print:grid-cols-2">
          <TrendBars
            title={t('trend.created')}
            points={breakdown.trend}
            value={(point) => point.workOrdersCreated}
            label={dateLabel}
            formatValue={n.int}
            tone="primary"
          />
          <TrendBars
            title={t('trend.energy')}
            points={breakdown.trend}
            value={(point) => point.energyKWh}
            label={dateLabel}
            formatValue={(value) => t('kwhValue', { kwh: n.one(value) })}
            tone="brand"
          />
        </div>
        <details className="border-t border-border print:hidden" open={printable}>
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-primary">
            {t('trend.showTable')}
          </summary>
          <Table
            head={
              <>
                <Th>{t('columns.date')}</Th>
                <Th end>{t('columns.created')}</Th>
                <Th end>{t('columns.resolved')}</Th>
                <Th end>{t('columns.complaints')}</Th>
                <Th end>{t('columns.energy')}</Th>
              </>
            }
          >
            {breakdown.trend.map((point) => (
              <tr key={point.date}>
                <Td>{dateLabel(point.date)}</Td>
                <Td end>{n.int(point.workOrdersCreated)}</Td>
                <Td end>{n.int(point.workOrdersResolved)}</Td>
                <Td end>{n.int(point.complaints)}</Td>
                <Td end>{n.one(point.energyKWh)}</Td>
              </tr>
            ))}
          </Table>
        </details>
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          {t('trend.energyNote')}
        </p>
      </Section>

      <Section title={t('faults.title')} description={t('faults.description')}>
        {breakdown.faults.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="space-y-3 p-5">
            {breakdown.faults.map((row) => (
              <li
                key={row.faultType}
                className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm"
              >
                <span className="truncate">
                  {faultLabel(row.faultType === 'UNSPECIFIED' ? null : row.faultType)}
                </span>
                <progress
                  aria-hidden="true"
                  max={maxFault}
                  value={row.count}
                  className="h-2.5 w-full appearance-none overflow-hidden rounded-full bg-surface-subtle [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-surface-subtle [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
                />
                <span className="tabular-nums font-medium">{n.int(row.count)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={t('wards.title')}
        description={t('wards.description')}
        action={
          printable ? null : (
            <CsvButton
              label={t('downloadCsv')}
              onClick={() =>
                downloadCsv(`report-wards-${days}d-${stamp}.csv`, [
                  [
                    'ward',
                    'poles',
                    'working',
                    'faulty',
                    'offline',
                    'work_orders_created',
                    ...performanceCsvHead,
                  ],
                  ...breakdown.wards.map((row) => [
                    wardName(row),
                    row.poles,
                    row.working,
                    row.faulty,
                    row.offline,
                    row.workOrdersCreated,
                    ...performanceCsv(row),
                  ]),
                ])
              }
            />
          )
        }
      >
        <Table
          printable={printable}
          minWidth="min-w-[52rem]"
          head={
            <>
              <Th>{t('columns.ward')}</Th>
              <Th end>{t('columns.poles')}</Th>
              <Th end>{t('columns.working')}</Th>
              <Th end>{t('columns.faulty')}</Th>
              <Th end>{t('columns.offline')}</Th>
              <Th end>{t('columns.created')}</Th>
              {performanceHead}
            </>
          }
        >
          {breakdown.wards.length === 0 ? (
            <EmptyRow colSpan={11} text={t('empty')} />
          ) : (
            breakdown.wards.map((row) => (
              <tr key={`${row.wardId ?? 'legacy'}:${row.name ?? ''}`}>
                <Td>
                  <span className={cn(!row.name && 'text-muted-foreground')}>{wardName(row)}</span>
                </Td>
                <Td end>{n.int(row.poles)}</Td>
                <Td end>{n.pct(share(row.working, row.poles))}</Td>
                <Td end>
                  <span className={cn(row.faulty > 0 && 'font-semibold text-danger')}>
                    {n.int(row.faulty)}
                  </span>
                </Td>
                <Td end>{n.int(row.offline)}</Td>
                <Td end>{n.int(row.workOrdersCreated)}</Td>
                {performanceCells(row)}
              </tr>
            ))
          )}
        </Table>
      </Section>

      <Section
        title={t('technicians.title')}
        description={t('technicians.description')}
        action={
          printable ? null : (
            <CsvButton
              label={t('downloadCsv')}
              onClick={() =>
                downloadCsv(`report-technicians-${days}d-${stamp}.csv`, [
                  ['technician', 'agency', ...performanceCsvHead],
                  ...breakdown.technicians.map((row) => [
                    row.name,
                    row.agency,
                    ...performanceCsv(row),
                  ]),
                ])
              }
            />
          )
        }
      >
        <Table
          printable={printable}
          head={
            <>
              <Th>{t('columns.technician')}</Th>
              <Th>{t('columns.agency')}</Th>
              {performanceHead}
            </>
          }
        >
          {breakdown.technicians.length === 0 ? (
            <EmptyRow colSpan={7} text={t('empty')} />
          ) : (
            breakdown.technicians.map((row) => (
              <tr key={row.id}>
                <Td>{row.name}</Td>
                <Td>{row.agency ?? '—'}</Td>
                {performanceCells(row)}
              </tr>
            ))
          )}
        </Table>
      </Section>

      <Section
        title={t('agencies.title')}
        description={t('agencies.description')}
        action={
          printable ? null : (
            <CsvButton
              label={t('downloadCsv')}
              onClick={() =>
                downloadCsv(`report-agencies-${days}d-${stamp}.csv`, [
                  ['agency', ...performanceCsvHead],
                  ...breakdown.agencies.map((row) => [row.name, ...performanceCsv(row)]),
                ])
              }
            />
          )
        }
      >
        <Table
          printable={printable}
          minWidth="min-w-[34rem]"
          head={
            <>
              <Th>{t('columns.agency')}</Th>
              {performanceHead}
            </>
          }
        >
          {breakdown.agencies.length === 0 ? (
            <EmptyRow colSpan={6} text={t('empty')} />
          ) : (
            breakdown.agencies.map((row) => (
              <tr key={row.id}>
                <Td>{row.name}</Td>
                {performanceCells(row)}
              </tr>
            ))
          )}
        </Table>
      </Section>
    </div>
  );
}
