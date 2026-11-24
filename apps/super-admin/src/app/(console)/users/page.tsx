'use client';

import {
  USER_ROLES,
  type StaffUserDto,
  type TenantDto,
  type UserRoleName,
} from '@smart-light/shared';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
} from '@smart-light/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const PAGE_SIZE = 25;

export default function PlatformUsersPage() {
  const t = useTranslations('Users');
  const tCommon = useTranslations('Common');
  const format = useFormatter();
  const locale = useLocale();

  const [tenantId, setTenantId] = useState('');
  const [role, setRole] = useState<UserRoleName | ''>('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'DISABLED'>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.request<TenantDto[]>('/v1/tenants'),
  });
  const users = useQuery({
    queryKey: ['users', tenantId, role, status, debouncedSearch, page],
    queryFn: () =>
      api.page<StaffUserDto>('/v1/users', {
        query: { tenantId, role, status, search: debouncedSearch, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });

  const cityName = new Map(
    (tenants.data ?? []).map((tenant) => [
      tenant.id,
      locale === 'hi' ? tenant.nameHi : tenant.name,
    ]),
  );
  const now = new Date();

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          users.data ? (
            <span className="text-sm text-muted-foreground">
              {t('total', { count: users.data.pagination.totalItems })}
            </span>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 xl:grid-cols-4">
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
        <Field label={t('filters.role')}>
          {({ id }) => (
            <Select
              id={id}
              value={role}
              onChange={(event) => {
                setRole(event.target.value as UserRoleName | '');
                setPage(1);
              }}
            >
              <option value="">{t('filters.allRoles')}</option>
              {USER_ROLES.map((value) => (
                <option key={value} value={value}>
                  {tCommon(`roles.${value}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('filters.status')}>
          {({ id }) => (
            <Select
              id={id}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as '' | 'ACTIVE' | 'DISABLED');
                setPage(1);
              }}
            >
              <option value="">{t('filters.anyStatus')}</option>
              <option value="ACTIVE">{t('status.ACTIVE')}</option>
              <option value="DISABLED">{t('status.DISABLED')}</option>
            </Select>
          )}
        </Field>
        <Field label={t('filters.search')}>
          {({ id }) => (
            <Input
              id={id}
              type="search"
              value={search}
              placeholder={t('filters.searchPlaceholder')}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
        </Field>
      </div>

      {users.error ? (
        <Alert tone="danger" title={tCommon('errorTitle')} className="mb-4">
          {tCommon('errorBody')}
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        {users.isPending ? (
          <div className="grid gap-3 p-5">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : users.data && users.data.items.length === 0 ? (
          <EmptyState className="m-5" icon={<Users />} title={t('empty')} />
        ) : users.data ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <caption className="sr-only">{t('title')}</caption>
              <thead className="bg-surface-subtle/60 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('columns.name')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.role')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.city')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.status')}
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('columns.lastLogin')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.data.items.map((user) => (
                  <tr key={user.id} className="hover:bg-surface-subtle/50">
                    <th scope="row" className="px-5 py-3 font-normal">
                      <span className="block font-medium">{user.name}</span>
                      <span className="block text-xs text-muted-foreground">{user.email}</span>
                    </th>
                    <td className="px-3 py-3">
                      {tCommon(`roles.${user.role}`)}
                      {user.agency ? (
                        <span className="block text-xs text-muted-foreground">
                          {user.agency.name}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      {user.tenantId ? (cityName.get(user.tenantId) ?? '—') : t('platform')}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={user.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {t(`status.${user.status}`)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {user.lastLoginAt ? (
                        <time dateTime={user.lastLoginAt}>
                          {format.relativeTime(new Date(user.lastLoginAt), now)}
                        </time>
                      ) : (
                        t('neverSignedIn')
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {users.data && users.data.pagination.totalPages > 1 ? (
        <Pagination
          className="mt-4"
          page={users.data.pagination.page}
          totalPages={users.data.pagination.totalPages}
          onChange={setPage}
          labels={{
            previous: tCommon('previous'),
            next: tCommon('next'),
            status: tCommon('pageStatus', {
              page: users.data.pagination.page,
              total: users.data.pagination.totalPages,
            }),
          }}
        />
      ) : null}
    </>
  );
}
