'use client';

import type { LightStatusName, PoleMapItemDto, ZoneDto } from '@smart-light/shared';
import {
  Alert,
  Button,
  cn,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  StreetPole,
} from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import { Map as MapIcon, RotateCcw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  shortPoleNumber,
  STREET_STATUS,
  STREET_STATUS_ORDER,
  ZoneStreet,
} from '@/components/lighting/ZoneStreet';
import { api } from '@/lib/api';

const PROBLEMS: LightStatusName[] = ['FAULT', 'OFFLINE'];

export default function StreetViewPage() {
  const t = useTranslations('Streets');
  const tCommon = useTranslations('Common');
  const tLight = useTranslations('LightStatus');
  const format = useFormatter();

  const [zoneId, setZoneId] = useState('');
  const [statuses, setStatuses] = useState<Set<LightStatusName>>(new Set());
  const [search, setSearch] = useState('');

  const poles = useQuery({
    queryKey: ['pole-map'],
    queryFn: () => api.request<PoleMapItemDto[]>('/v1/poles/map'),
    refetchInterval: 60_000,
  });
  const zones = useQuery({
    queryKey: ['zones'],
    queryFn: () => api.request<ZoneDto[]>('/v1/zones'),
  });

  const query = search.trim().toUpperCase();
  const isMatch = useMemo(
    () => (pole: PoleMapItemDto) =>
      (statuses.size === 0 || statuses.has(pole.lightStatus)) &&
      (query === '' || pole.code.includes(query) || shortPoleNumber(pole.code) === query),
    [statuses, query],
  );
  const filtering = statuses.size > 0 || query !== '';

  // One street per zone; the zones with the most problems first.
  const streets = useMemo(() => {
    const byZone = new Map<string, PoleMapItemDto[]>();
    for (const pole of poles.data ?? []) {
      const key = pole.zoneId ?? '';
      byZone.set(key, [...(byZone.get(key) ?? []), pole]);
    }
    const zoneById = new Map((zones.data ?? []).map((zone) => [zone.id, zone]));
    const problems = (list: PoleMapItemDto[]) =>
      list.filter((pole) => PROBLEMS.includes(pole.lightStatus)).length;
    return [...byZone.entries()]
      .map(([key, list]) => ({
        key,
        zone: key ? (zoneById.get(key) ?? null) : null,
        poles: list,
      }))
      .filter((street) => !zoneId || street.key === zoneId)
      .sort(
        (a, b) =>
          problems(b.poles) - problems(a.poles) ||
          (a.zone?.name ?? '~').localeCompare(b.zone?.name ?? '~'),
      );
  }, [poles.data, zones.data, zoneId]);

  const inScope = streets.flatMap((street) => street.poles);
  const counts = new Map<LightStatusName, number>();
  for (const pole of inScope) {
    counts.set(pole.lightStatus, (counts.get(pole.lightStatus) ?? 0) + 1);
  }
  const visibleStreets = filtering
    ? streets.filter((street) => street.poles.some(isMatch))
    : streets;
  const hiddenZones = streets.length - visibleStreets.length;
  const shown = inScope.filter(isMatch).length;

  const toggle = (status: LightStatusName) =>
    setStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  const problemsOnly = PROBLEMS.every((status) => statuses.has(status)) && statuses.size === 2;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button asChild variant="secondary">
            <Link href="/map">
              <MapIcon aria-hidden="true" />
              {t('openMap')}
            </Link>
          </Button>
        }
      />

      {poles.error ? (
        <Alert tone="danger" title={tCommon('errorTitle')}>
          {tCommon('errorBody')}
        </Alert>
      ) : null}

      {/* All filters in one place */}
      <section
        aria-labelledby="street-filters"
        className="mb-6 rounded-2xl border border-border bg-surface p-4"
      >
        <h2 id="street-filters" className="sr-only">
          {t('filters.heading')}
        </h2>

        <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,16rem)_1fr] md:items-end">
          <Field label={t('filters.zone')}>
            {({ id }) => (
              <Select id={id} value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
                <option value="">{t('filters.allZones')}</option>
                {(zones.data ?? []).map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name} ({zone.code})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('filters.search')}>
            {({ id }) => (
              <Input
                id={id}
                type="search"
                inputMode="text"
                value={search}
                placeholder={t('filters.searchPlaceholder')}
                onChange={(event) => setSearch(event.target.value)}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Button
              type="button"
              variant={problemsOnly ? 'primary' : 'outline'}
              aria-pressed={problemsOnly}
              onClick={() => setStatuses(problemsOnly ? new Set() : new Set(PROBLEMS))}
            >
              <TriangleAlert aria-hidden="true" />
              {t('filters.problemsOnly')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!filtering && !zoneId}
              onClick={() => {
                setStatuses(new Set());
                setSearch('');
                setZoneId('');
              }}
            >
              <RotateCcw aria-hidden="true" />
              {t('filters.reset')}
            </Button>
          </div>
        </div>

        {/* Status tiles double as filters */}
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium">{t('filters.status')}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {STREET_STATUS_ORDER.map((status) => {
              const active = statuses.has(status);
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(status)}
                  className={cn(
                    'flex min-h-16 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                    active
                      ? 'border-primary bg-primary-subtle ring-2 ring-primary'
                      : 'border-border hover:bg-surface-subtle',
                  )}
                >
                  <span className="flex h-14 w-10 shrink-0 items-end justify-center overflow-hidden rounded-lg bg-night pb-1">
                    <StreetPole status={STREET_STATUS[status]} size="sm" animated={false} />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        'block text-2xl font-semibold tabular-nums',
                        status === 'FAULT' && (counts.get(status) ?? 0) > 0 && 'text-danger',
                        status === 'OFFLINE' && (counts.get(status) ?? 0) > 0 && 'text-warning',
                      )}
                    >
                      {format.number(counts.get(status) ?? 0)}
                    </span>
                    <span className="block text-sm text-muted-foreground">{tLight(status)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
          {t('filters.showing', {
            shown: format.number(shown),
            total: format.number(inScope.length),
          })}
          {hiddenZones > 0 ? ` ${t('filters.hiddenZones', { count: hiddenZones })}` : ''}
        </p>
      </section>

      {poles.data && zones.data ? (
        poles.data.length === 0 ? (
          <Alert tone="info">{t('empty')}</Alert>
        ) : visibleStreets.length === 0 ? (
          <Alert tone="info">{t('noMatch')}</Alert>
        ) : (
          <div className="grid gap-5">
            {visibleStreets.map((street) => (
              <ZoneStreet
                key={street.key || 'none'}
                zone={street.zone}
                poles={street.poles}
                isMatch={filtering ? isMatch : undefined}
              />
            ))}
          </div>
        )
      ) : (
        <div className="grid gap-5">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-56" />
          ))}
        </div>
      )}
    </>
  );
}
