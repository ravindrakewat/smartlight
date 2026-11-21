'use client';

import type { WorkOrderSummaryDto } from '@smart-light/shared';
import { Alert, Card, EmptyState, PageHeader, Pagination, Skeleton, cn } from '@smart-light/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import {
  DeadlineLabel,
  PriorityBadge,
  useFaultLabel,
  WorkOrderStatusBadge,
} from '@/components/labels';
import { api } from '@/lib/api';

const FILTERS = {
  open: { open: true },
  overdue: { overdue: true },
  pending: { status: 'PENDING_VERIFICATION' },
  resolved: { status: 'RESOLVED' },
  all: {},
} as const;
type FilterKey = keyof typeof FILTERS;
const PAGE_SIZE = 20;

function WorkOrdersView() {
  const t = useTranslations('WorkOrders');
  const tCommon = useTranslations('Common');
  const faultLabel = useFaultLabel();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filterParam = searchParams.get('filter');
  const filter: FilterKey =
    filterParam && filterParam in FILTERS ? (filterParam as FilterKey) : 'open';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const { data, error, isPending } = useQuery({
    queryKey: ['work-orders', filter, page],
    queryFn: () =>
      api.page<WorkOrderSummaryDto>('/v1/work-orders', {
        query: { ...FILTERS[filter], page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  function navigate(next: { filter?: FilterKey; page?: number }) {
    const params = new URLSearchParams(searchParams);
    if (next.filter) {
      params.set('filter', next.filter);
      params.delete('page');
    }
    if (next.page) {
      params.set('page', String(next.page));
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />

      <div role="tablist" aria-label={t('filters.label')} className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(FILTERS) as FilterKey[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => navigate({ filter: key })}
            className={cn(
              'min-h-10 cursor-pointer rounded-full border px-4 text-sm font-semibold transition-colors',
              filter === key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-surface text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`filters.${key}`)}
          </button>
        ))}
      </div>

      {error ? (
        <Alert tone="danger" title={tCommon('errorTitle')}>
          {tCommon('errorBody')}
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        {isPending ? (
          <div className="grid gap-3 p-5">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : data && data.items.length === 0 ? (
          <EmptyState className="m-5" icon={<ClipboardCheck />} title={t('empty')} />
        ) : data ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="bg-surface-subtle/60">
                <tr className="text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('columns.number')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.pole')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.fault')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.priority')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.status')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.technician')}
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('columns.due')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((workOrder) => (
                  <tr key={workOrder.id} className="hover:bg-surface-subtle/50">
                    <th scope="row" className="px-5 py-3 font-medium">
                      <Link
                        href={`/work-orders/${workOrder.id}`}
                        className="text-primary hover:underline"
                      >
                        {workOrder.number}
                      </Link>
                      {workOrder.complaintCount > 0 ? (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {t('complaints', { count: workOrder.complaintCount })}
                        </span>
                      ) : null}
                    </th>
                    <td className="px-3 py-3">
                      <span className="font-mono">{workOrder.pole.code}</span>
                      {workOrder.pole.zoneName ? (
                        <span className="block text-xs text-muted-foreground">
                          {workOrder.pole.zoneName}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">{faultLabel(workOrder.faultType)}</td>
                    <td className="px-3 py-3">
                      <PriorityBadge priority={workOrder.priority} />
                    </td>
                    <td className="px-3 py-3">
                      <WorkOrderStatusBadge status={workOrder.status} />
                    </td>
                    <td className="px-3 py-3">
                      {workOrder.technician?.name ?? (
                        <span className="text-muted-foreground">{t('unassigned')}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <DeadlineLabel dueAt={workOrder.slaDueAt} overdue={workOrder.overdue} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {data ? (
        <Pagination
          className="mt-4"
          page={data.pagination.page}
          totalPages={data.pagination.totalPages}
          onChange={(next) => navigate({ page: next })}
          labels={{
            previous: tCommon('previous'),
            next: tCommon('next'),
            status: tCommon('pageStatus', {
              page: data.pagination.page,
              total: data.pagination.totalPages,
            }),
          }}
        />
      ) : null}
    </>
  );
}

export default function WorkOrdersPage() {
  return (
    <Suspense>
      <WorkOrdersView />
    </Suspense>
  );
}
