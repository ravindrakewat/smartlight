'use client';

import type { DeviceEventDto } from '@smart-light/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
} from '@smart-light/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { useFaultLabel } from '@/components/labels';
import { useSessionUser } from '@/components/Session';
import { api } from '@/lib/api';

const PAGE_SIZE = 25;
const RESOLVERS = new Set(['SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'SUPERVISOR', 'OPERATOR']);
const SEVERITY_TONE = { critical: 'danger', warning: 'warning', info: 'info' } as const;

export default function AlertsPage() {
  const t = useTranslations('Lighting.alerts');
  const tCommon = useTranslations('Common');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const faultLabel = useFaultLabel();
  const user = useSessionUser();
  const queryClient = useQueryClient();
  const showId = useId();
  const severityId = useId();

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

  const resolve = useMutation({
    mutationFn: (id: string) => api.request(`/v1/alerts/${id}/resolve`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          alerts.data ? (
            <span className="text-sm text-muted-foreground">
              {t('total', { count: alerts.data.pagination.totalItems })}
            </span>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <div>
          <label htmlFor={showId} className="sr-only">
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
        <div>
          <label htmlFor={severityId} className="sr-only">
            {t('severity')}
          </label>
          <Select
            id={severityId}
            value={severity}
            onChange={(event) => {
              setSeverity(event.target.value as '' | DeviceEventDto['severity']);
              setPage(1);
            }}
          >
            <option value="">{t('allSeverities')}</option>
            <option value="critical">{t('severities.critical')}</option>
            <option value="warning">{t('severities.warning')}</option>
          </Select>
        </div>
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
                  <tr key={alert.id} className="hover:bg-surface-subtle/50">
                    <th scope="row" className="px-5 py-3 font-normal">
                      <span className="flex flex-wrap items-center gap-2">
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
