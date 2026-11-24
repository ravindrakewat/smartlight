'use client';

import type { AuditEntryDto, TenantDto } from '@smart-light/shared';
import {
  Alert,
  Card,
  cn,
  EmptyState,
  Field,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
} from '@smart-light/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScrollText, ShieldAlert } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { api } from '@/lib/api';
import { AUDIT_CATEGORIES, auditCategory, isSecurityEvent } from '@/lib/audit';

const PAGE_SIZE = 30;

export default function AuditPage() {
  const t = useTranslations('Audit');
  const tCommon = useTranslations('Common');
  const format = useFormatter();
  const locale = useLocale();

  const [tenantId, setTenantId] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);

  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.request<TenantDto[]>('/v1/tenants'),
  });
  const entries = useQuery({
    queryKey: ['audit', tenantId, category, page],
    queryFn: () =>
      api.page<AuditEntryDto>('/v1/audit', {
        query: {
          tenantId,
          action: category ? `${category}.` : '',
          page,
          pageSize: PAGE_SIZE,
        },
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />

      <div className="mb-4 grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 lg:max-w-3xl">
        <Field label={t('filters.city')}>
          {({ id }) => (
            <Select
              id={id}
              value={tenantId}
              onChange={(event) => {
                setTenantId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('filters.allCities')}</option>
              {(tenants.data ?? []).map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {locale === 'hi' ? tenant.nameHi : tenant.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('filters.category')}>
          {({ id }) => (
            <Select
              id={id}
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('filters.allCategories')}</option>
              {AUDIT_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {t(`categories.${value}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {entries.error ? (
        <Alert tone="danger" title={tCommon('errorTitle')} className="mb-4">
          {tCommon('errorBody')}
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        {entries.isPending ? (
          <div className="grid gap-3 p-5">
            {Array.from({ length: 10 }, (_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : entries.data && entries.data.items.length === 0 ? (
          <EmptyState className="m-5" icon={<ScrollText />} title={t('empty')} />
        ) : entries.data ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <caption className="sr-only">{t('title')}</caption>
              <thead className="bg-surface-subtle/60 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('columns.time')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.action')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.actor')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.city')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.entity')}
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('columns.ip')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.data.items.map((entry) => {
                  const family = auditCategory(entry.action);
                  const security = isSecurityEvent(entry.action);
                  return (
                    <tr key={entry.id} className={cn(security && 'bg-danger-subtle/40')}>
                      <td className="px-5 py-3 whitespace-nowrap tabular-nums">
                        <time dateTime={entry.createdAt}>
                          {format.dateTime(new Date(entry.createdAt), {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </time>
                      </td>
                      <th scope="row" className="px-3 py-3 font-normal">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-xs font-medium',
                            security ? 'text-danger' : 'text-muted-foreground',
                          )}
                        >
                          {security ? (
                            <ShieldAlert aria-hidden="true" className="size-3.5" />
                          ) : null}
                          {family ? t(`categories.${family}`) : t('categories.other')}
                        </span>
                        <span className="block font-mono text-xs">{entry.action}</span>
                      </th>
                      <td className="px-3 py-3">
                        {entry.actor ?? '—'}
                        <span className="block text-xs text-muted-foreground">
                          {t(`actorTypes.${entry.actorType}`)}
                        </span>
                      </td>
                      <td className="px-3 py-3">{entry.tenant?.name ?? t('platform')}</td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                        {entry.entityType ? (
                          <>
                            {entry.entityType}
                            {entry.entityId ? (
                              <span className="block max-w-[12rem] truncate" title={entry.entityId}>
                                {entry.entityId}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                        {entry.ip ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {entries.data && entries.data.pagination.totalPages > 1 ? (
        <Pagination
          className="mt-4"
          page={entries.data.pagination.page}
          totalPages={entries.data.pagination.totalPages}
          onChange={setPage}
          labels={{
            previous: tCommon('previous'),
            next: tCommon('next'),
            status: tCommon('pageStatus', {
              page: entries.data.pagination.page,
              total: entries.data.pagination.totalPages,
            }),
          }}
        />
      ) : null}
    </>
  );
}
