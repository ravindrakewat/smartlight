'use client';

import type { DeviceEventDto } from '@smart-light/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  cn,
  EmptyState,
  KpiCard,
  Pagination,
  Select,
  Skeleton,
} from '@smart-light/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { useFaultLabel } from '@/components/labels';
import { useSessionUser } from '@/components/Session';
import { ConsoleHero } from '@/components/shell/ConsoleHero';
import { api } from '@/lib/api';

const PAGE_SIZE = 25;
const RESOLVERS = new Set(['SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'SUPERVISOR', 'OPERATOR']);
const SEVERITY_TONE = { critical: 'danger', warning: 'warning', info: 'info' } as const;
const SEVERITIES = ['critical', 'warning', 'info'] as const;
const SEVERITY_BORDER = {
  critical: 'border-l-danger',
  warning: 'border-l-brand',
  info: 'border-l-primary',
} as const;
const SEVERITY_ICON_CLASS = {
  critical: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
} as const;

/** Open alerts of one severity (or all), for the summary cards. */
function useOpenCount(severity: '' | DeviceEventDto['severity']) {
  const { data } = useQuery({
    queryKey: ['alerts', 'open-count', severity],
    queryFn: () => api.page<DeviceEventDto>('/v1/alerts', { query: { severity, pageSize: 1 } }),
    refetchInterval: 30_000,
  });
  return data?.pagination.totalItems;
}

export default function AlertsPage() {
  const t = useTranslations('Lighting.alerts');
  const tCommon = useTranslations('Common');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const faultLabel = useFaultLabel();
  const user = useSessionUser();
  const queryClient = useQueryClient();
  const showId = useId();

  const [open, setOpen] = useState(true);
  const [severity, setSeverity] = useState<'' | DeviceEventDto['severity']>('');
  const [page, setPage] = useState(1);

  const alerts = useQuery({
    queryKey: ['alerts', open, severity, page],
    queryFn: () =>
      api.page<DeviceEventDto>('/v1/alerts', {
        query: { open: String(open), severity, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const totals = {
    all: useOpenCount(''),
    critical: useOpenCount('critical'),
    warning: useOpenCount('warning'),
    info: useOpenCount('info'),
  };
  const shareOf = (value: number | undefined) =>
    value !== undefined && totals.all ? value / totals.all : null;
  const percent = (value: number | null) =>
    value === null
      ? undefined
      : format.number(value, { style: 'percent', maximumFractionDigits: 1 });
  const chooseSeverity = (next: '' | DeviceEventDto['severity']) => {
    setSeverity((current) => (current === next ? '' : next));
    setPage(1);
  };

  const resolve = useMutation({
    mutationFn: (id: string) => api.request(`/v1/alerts/${id}/resolve`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  return (
    <>
      <ConsoleHero title={t('title')} description={t('description')} icon={<Bell />} />

      <section aria-label={t('summary')} className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t('cards.open')}
          value={totals.all === undefined ? '—' : format.number(totals.all)}
          hint={t('cards.openHint')}
          icon={<Bell />}
          tone="info"
          pressed={severity === ''}
          onClick={() => chooseSeverity('')}
        />
        {SEVERITIES.map((value) => (
          <KpiCard
            key={value}
            label={t(`severities.${value}`)}
            value={totals[value] === undefined ? '—' : format.number(totals[value])}
            hint={
              percent(shareOf(totals[value]))
                ? t('cards.share', { percent: percent(shareOf(totals[value])) ?? '' })
                : undefined
            }
            share={shareOf(totals[value])}
            icon={
              value === 'critical' ? (
                <TriangleAlert />
              ) : value === 'warning' ? (
                <CircleAlert />
              ) : (
                <Info />
              )
            }
            tone={SEVERITY_TONE[value]}
            pressed={severity === value}
            onClick={() => chooseSeverity(value)}
          />
        ))}
      </section>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:w-64">
          <label htmlFor={showId} className="mb-1 block text-sm font-medium">
            {t('show')}
          </label>
          <Select
            id={showId}
            value={open ? 'open' : 'all'}
            onChange={(event) => {
              setOpen(event.target.value === 'open');
              setPage(1);
            }}
          >
            <option value="open">{t('openOnly')}</option>
            <option value="all">{t('all')}</option>
          </Select>
        </div>
        {alerts.data ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t('total', { count: alerts.data.pagination.totalItems })}
          </p>
        ) : null}
      </div>

      {alerts.error ? (
        <Alert tone="danger" title={tCommon('errorTitle')}>
          {tCommon('errorBody')}
        </Alert>
      ) : null}
      {resolve.error ? <Alert tone="danger">{t('resolveFailed')}</Alert> : null}

      <Card className="overflow-hidden">
        {alerts.isPending ? (
          <div className="grid gap-3 p-5">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : alerts.data && alerts.data.items.length === 0 ? (
          <EmptyState
            className="m-5"
            icon={<BellOff />}
            title={t('empty')}
            description={t('emptyBody')}
          />
        ) : alerts.data ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-surface-subtle/60">
                <tr className="text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('columns.alert')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.pole')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.when')}
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    <span className="sr-only">{t('columns.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {alerts.data.items.map((alert) => (
                  <tr
                    key={alert.id}
                    className={cn(
                      'border-l-4 hover:bg-surface-subtle/50',
                      alert.resolvedAt ? 'border-l-border' : SEVERITY_BORDER[alert.severity],
                    )}
                  >
                    <th scope="row" className="py-3 pr-3 pl-4 font-normal">
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={cn(
                            '[&_svg]:size-5',
                            alert.resolvedAt
                              ? 'text-muted-foreground'
                              : SEVERITY_ICON_CLASS[alert.severity],
                          )}
                        >
                          {alert.severity === 'critical' ? (
                            <TriangleAlert />
                          ) : alert.severity === 'warning' ? (
                            <CircleAlert />
                          ) : (
                            <Info />
                          )}
                        </span>
                        <span className="font-medium">{faultLabel(alert.type)}</span>
                        <Badge tone={SEVERITY_TONE[alert.severity]}>
                          {t(`severities.${alert.severity}`)}
                        </Badge>
                        {alert.resolvedAt ? <Badge tone="neutral">{t('resolved')}</Badge> : null}
                      </span>
                      {alert.message ? (
                        <span className="block text-xs text-muted-foreground">{alert.message}</span>
                      ) : null}
                    </th>
                    <td className="px-3 py-3">
                      {alert.pole ? (
                        <Link
                          href={`/poles/${alert.pole.id}`}
                          className="font-mono font-medium text-primary hover:underline"
                        >
                          {alert.pole.code}
                        </Link>
                      ) : (
                        <span className="font-mono text-muted-foreground">{alert.deviceId}</span>
                      )}
                      {alert.pole?.address ? (
                        <span className="block text-xs text-muted-foreground">
                          {alert.pole.address}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                      <time
                        dateTime={alert.receivedAt}
                        title={format.dateTime(new Date(alert.receivedAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      >
                        {format.relativeTime(new Date(alert.receivedAt), now)}
                      </time>
                    </td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap">
                      <div className="flex flex-col items-end gap-0.5">
                        {alert.workOrderId ? (
                          <Link
                            href={`/work-orders/${alert.workOrderId}`}
                            className="text-sm font-semibold text-primary hover:underline"
                          >
                            {t('workOrder')}
                          </Link>
                        ) : null}
                        {!alert.resolvedAt && RESOLVERS.has(user.role) ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={resolve.isPending}
                            onClick={() => resolve.mutate(alert.id)}
                          >
                            {t('resolve')}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {alerts.data ? (
        <Pagination
          className="mt-4"
          page={alerts.data.pagination.page}
          totalPages={alerts.data.pagination.totalPages}
          onChange={setPage}
          labels={{
            previous: tCommon('previous'),
            next: tCommon('next'),
            status: tCommon('pageStatus', {
              page: alerts.data.pagination.page,
              total: alerts.data.pagination.totalPages,
            }),
          }}
        />
      ) : null}
    </>
  );
}
