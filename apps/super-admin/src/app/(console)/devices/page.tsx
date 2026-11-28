'use client';

import type { DeviceListItemDto, TenantDto } from '@smart-light/shared';
import {
  Alert,
  Card,
  cn,
  EmptyState,
  Field,
  Input,
  Pagination,
  Select,
  Skeleton,
  StatTile,
} from '@smart-light/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Cpu, Lightbulb, LightbulbOff, Search, Wifi, WifiOff } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ConsoleHero } from '@/components/shell/ConsoleHero';

const PAGE_SIZE = 25;
const MODES = ['auto', 'manual', 'failsafe'] as const;

function isKnownMode(mode: string): mode is (typeof MODES)[number] {
  return (MODES as readonly string[]).includes(mode);
}

export default function DevicesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Devices />
    </Suspense>
  );
}

function Devices() {
  const t = useTranslations('Devices');
  const tCommon = useTranslations('Common');
  const format = useFormatter();
  const locale = useLocale();
  const searchParams = useSearchParams();

  const [tenantId, setTenantId] = useState(searchParams.get('tenant') ?? '');
  const [online, setOnline] = useState<'' | 'true' | 'false'>('');
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
  const devices = useQuery({
    queryKey: ['devices', tenantId, online, debouncedSearch, page],
    queryFn: () =>
      api.page<DeviceListItemDto>('/v1/devices', {
        query: { tenantId, online, search: debouncedSearch, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  // Fleet totals for the chosen city (or all cities) from the tenant stats.
  const scope = (tenants.data ?? []).filter((tenant) => !tenantId || tenant.id === tenantId);
  const total = scope.reduce((sum, tenant) => sum + tenant.stats.devices, 0);
  const onlineCount = scope.reduce((sum, tenant) => sum + tenant.stats.devicesOnline, 0);
  const now = new Date();

  const percent = (part: number, whole: number) =>
    format.number(whole ? part / whole : 0, { style: 'percent', maximumFractionDigits: 1 });

  return (
    <>
      <ConsoleHero icon={<Cpu />} title={t('title')} description={t('description')} />

      <section aria-label={t('summary')} className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile
          tone="blue"
          icon={<Cpu />}
          label={t('stats.total')}
          loading={!tenants.data}
          value={format.number(total)}
        />
        <StatTile
          tone="green"
          icon={<Wifi />}
          label={t('stats.online')}
          loading={!tenants.data}
          value={format.number(onlineCount)}
          note={percent(onlineCount, total)}
        />
        <StatTile
          tone="orange"
          icon={<WifiOff />}
          label={t('stats.offline')}
          loading={!tenants.data}
          value={format.number(total - onlineCount)}
          note={percent(total - onlineCount, total)}
        />
      </section>

      <div className="mb-4 grid gap-3 rounded-2xl border border-border bg-surface p-4 md:grid-cols-3">
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
        <Field label={t('filters.connection')}>
          {({ id }) => (
            <Select
              id={id}
              value={online}
              onChange={(event) => {
                setOnline(event.target.value as '' | 'true' | 'false');
                setPage(1);
              }}
            >
              <option value="">{t('filters.any')}</option>
              <option value="true">{t('online')}</option>
              <option value="false">{t('offline')}</option>
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

      {devices.error ? (
        <Alert tone="danger" title={tCommon('errorTitle')} className="mb-4">
          {tCommon('errorBody')}
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        {devices.isPending ? (
          <div className="grid gap-3 p-5">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : devices.data && devices.data.items.length === 0 ? (
          <EmptyState className="m-5" icon={<Search />} title={t('empty')} />
        ) : devices.data ? (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <caption className="sr-only">{t('title')}</caption>
              <thead className="bg-surface-subtle/60 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('columns.device')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.city')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.connection')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.lamp')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.firmware')}
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('columns.lastSeen')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {devices.data.items.map((device) => (
                  <tr key={device.id} className="hover:bg-surface-subtle/50">
                    <th scope="row" className="px-5 py-3 font-normal">
                      <span className="block font-mono font-medium">{device.deviceId}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {device.pole ? device.pole.code : t('notOnPole')}
                      </span>
                    </th>
                    <td className="px-3 py-3">
                      {device.tenant.name}
                      <span className="block font-mono text-xs text-muted-foreground">
                        {device.tenant.code}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 font-medium',
                          device.online ? 'text-success' : 'text-warning',
                        )}
                      >
                        {device.online ? (
                          <Wifi aria-hidden="true" className="size-4" />
                        ) : (
                          <WifiOff aria-hidden="true" className="size-4" />
                        )}
                        {device.online ? t('online') : t('offline')}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {device.lampOn === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          {device.lampOn ? (
                            <Lightbulb aria-hidden="true" className="size-4 text-brand" />
                          ) : (
                            <LightbulbOff
                              aria-hidden="true"
                              className="size-4 text-muted-foreground"
                            />
                          )}
                          {device.lampOn ? t('lampOn') : t('lampOff')}
                          {device.mode ? (
                            <span className="text-xs text-muted-foreground">
                              · {isKnownMode(device.mode) ? t(`modes.${device.mode}`) : device.mode}
                            </span>
                          ) : null}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{device.firmwareVersion ?? '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {device.lastSeenAt ? (
                        <time dateTime={device.lastSeenAt}>
                          {format.relativeTime(new Date(device.lastSeenAt), now)}
                        </time>
                      ) : (
                        t('never')
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {devices.data && devices.data.pagination.totalPages > 1 ? (
        <Pagination
          className="mt-4"
          page={devices.data.pagination.page}
          totalPages={devices.data.pagination.totalPages}
          onChange={setPage}
          labels={{
            previous: tCommon('previous'),
            next: tCommon('next'),
            status: tCommon('pageStatus', {
              page: devices.data.pagination.page,
              total: devices.data.pagination.totalPages,
            }),
          }}
        />
      ) : null}
    </>
  );
}
