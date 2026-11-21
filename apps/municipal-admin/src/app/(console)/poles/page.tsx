'use client';

import { LIGHT_STATUSES, type LightStatusName, type PoleDto } from '@smart-light/shared';
import {
  Alert,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
} from '@smart-light/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { LightStatusLabel } from '@/components/labels';
import { api } from '@/lib/api';

const PAGE_SIZE = 25;

export default function PolesPage() {
  const t = useTranslations('Poles');
  const tCommon = useTranslations('Common');
  const tLight = useTranslations('LightStatus');
  const format = useFormatter();
  const searchId = useId();
  const statusId = useId();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<LightStatusName | ''>('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, error, isPending } = useQuery({
    queryKey: ['poles', debouncedSearch, status, page],
    queryFn: () =>
      api.page<PoleDto>('/v1/poles', {
        query: { search: debouncedSearch, lightStatus: status, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          data ? (
            <span className="text-sm text-muted-foreground">
              {t('total', { count: data.pagination.totalItems })}
            </span>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_14rem]">
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            {t('search')}
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={searchId}
            type="search"
            className="pl-9"
            placeholder={t('search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor={statusId} className="sr-only">
            {t('statusFilter')}
          </label>
          <Select
            id={statusId}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as LightStatusName | '');
              setPage(1);
            }}
          >
            <option value="">{t('allStatuses')}</option>
            {LIGHT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {tLight(value)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error ? (
        <Alert tone="danger" title={tCommon('errorTitle')}>
          {tCommon('errorBody')}
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        {isPending ? (
          <div className="grid gap-3 p-5">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : data && data.items.length === 0 ? (
          <EmptyState className="m-5" icon={<Search />} title={t('empty')} />
        ) : data ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="bg-surface-subtle/60">
                <tr className="text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('columns.code')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.zone')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.address')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.status')}
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('columns.controller')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((pole) => (
                  <tr key={pole.id} className="hover:bg-surface-subtle/50">
                    <th scope="row" className="px-5 py-3 font-mono font-medium">
                      {pole.code}
                    </th>
                    <td className="px-3 py-3">{pole.zone?.name ?? '—'}</td>
                    <td className="px-3 py-3">
                      {pole.address ?? '—'}
                      {pole.ward ? (
                        <span className="block text-xs text-muted-foreground">{pole.ward}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <LightStatusLabel status={pole.lightStatus} />
                    </td>
                    <td className="px-5 py-3">
                      {pole.device ? (
                        <>
                          <span className={pole.device.online ? 'text-success' : 'text-warning'}>
                            {pole.device.online ? t('controllerOnline') : t('controllerOffline')}
                          </span>
                          <span className="block font-mono text-xs text-muted-foreground">
                            {pole.device.deviceId}
                            {pole.device.lastSeenAt
                              ? ` · ${format.dateTime(new Date(pole.device.lastSeenAt), { dateStyle: 'short', timeStyle: 'short' })}`
                              : ''}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{t('noController')}</span>
                      )}
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
          onChange={setPage}
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
