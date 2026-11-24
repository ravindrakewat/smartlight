'use client';

import type { LightStatusName, PoleMapItemDto, ZoneDto } from '@smart-light/shared';
import { cn, StreetPole } from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { shortPoleNumber, STREET_STATUS, STREET_STATUS_ORDER } from './ZoneStreet';

const PROBLEMS: LightStatusName[] = ['FAULT', 'OFFLINE'];
const REFRESH_MS = 30_000;

export interface LiveRoadProps {
  /** The page's light-status filter: other poles are faded but stay on the road. */
  statusFilter?: LightStatusName | '';
}

/**
 * One zone drawn as a road at night with its poles on both footpaths, refreshed every
 * 30 seconds. Lit lamps throw light onto the road; faults and offline controllers
 * carry a badge, and every pole states its status as text for assistive technology.
 */
export function LiveRoad({ statusFilter = '' }: LiveRoadProps) {
  const t = useTranslations('Poles.road');
  const tStreet = useTranslations('Streets');
  const tLight = useTranslations('LightStatus');
  const format = useFormatter();
  const [chosenZone, setChosenZone] = useState<string | null>(null);
  const [focused, setFocused] = useState<PoleMapItemDto | null>(null);

  const poles = useQuery({
    queryKey: ['pole-map'],
    queryFn: () => api.request<PoleMapItemDto[]>('/v1/poles/map'),
    refetchInterval: REFRESH_MS,
  });
  const zones = useQuery({
    queryKey: ['zones'],
    queryFn: () => api.request<ZoneDto[]>('/v1/zones'),
  });

  // Zones that have poles, the ones with the most problems first.
  const roads = useMemo(() => {
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
        name: key ? (zoneById.get(key)?.name ?? key) : tStreet('zone.noZone'),
        poles: [...list].sort((a, b) => a.code.localeCompare(b.code)),
        problems: problems(list),
      }))
      .sort((a, b) => b.problems - a.problems || a.name.localeCompare(b.name));
  }, [poles.data, zones.data, tStreet]);

  const road = roads.find((item) => item.key === chosenZone) ?? roads[0];
  if (poles.error || !road) return null;

  const counts = new Map<LightStatusName, number>();
  for (const pole of road.poles) {
    counts.set(pole.lightStatus, (counts.get(pole.lightStatus) ?? 0) + 1);
  }
  const lit = (pole: PoleMapItemDto) => pole.lightStatus === 'ON' || pole.lightStatus === 'DIMMED';
  const detail = (pole: PoleMapItemDto) =>
    [
      pole.code,
      tLight(pole.lightStatus),
      lit(pole) && pole.dimPercent !== null
        ? tStreet('zone.brightness', { percent: pole.dimPercent })
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <section
      aria-labelledby="live-road"
      className="mb-6 overflow-hidden rounded-2xl border border-border bg-surface"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <h2 id="live-road" className="flex items-center gap-2 text-base font-semibold">
            <span className="relative flex size-2.5" aria-hidden="true">
              <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2.5 rounded-full bg-success" />
            </span>
            {t('title', { zone: road.name })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('updated', {
              time: format.dateTime(new Date(poles.dataUpdatedAt), { timeStyle: 'medium' }),
            })}
          </p>
        </div>
        <Link
          href="/streets"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t('allStreets')}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      {/* Zone picker */}
      <div role="group" aria-label={t('zones')} className="flex gap-2 overflow-x-auto px-4 py-3">
        {roads.map((item) => {
          const active = item.key === road.key;
          return (
            <button
              key={item.key || 'none'}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setChosenZone(item.key);
                setFocused(null);
              }}
              className={cn(
                'flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-surface hover:bg-surface-subtle',
              )}
            >
              {item.name}
              {item.problems > 0 ? (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                    active ? 'bg-surface text-danger' : 'bg-danger-subtle text-danger',
                  )}
                >
                  {t('problems', { count: item.problems })}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Counts for this zone */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-sm">
        {STREET_STATUS_ORDER.filter((status) => counts.get(status)).map((status) => (
          <li
            key={status}
            className={cn(
              'flex items-center gap-1.5 tabular-nums',
              status === 'FAULT' && 'font-semibold text-danger',
              status === 'OFFLINE' && 'font-semibold text-warning',
            )}
          >
            <span className="flex h-7 w-5 items-center justify-center rounded bg-night">
              <StreetPole status={STREET_STATUS[status]} size="xs" animated={false} />
            </span>
            {format.number(counts.get(status) ?? 0)} {tLight(status)}
          </li>
        ))}
      </ul>

      {/* The road at night: far footpath, road, near footpath */}
      <div className="bg-[radial-gradient(140%_120%_at_50%_0%,var(--color-night-soft),var(--color-night))]">
        <div className="overflow-x-auto">
          <div className="relative min-w-max px-6">
            {/* Footpaths and road, behind the poles */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-36">
              <div className="h-2 bg-pole/40" />
              <div className="relative h-20 overflow-hidden bg-road">
                <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-[repeating-linear-gradient(90deg,var(--color-lamp)_0_22px,transparent_22px_48px)] opacity-30" />
                {/* Two cars, one each way */}
                <div className="absolute top-3 hidden h-5 w-12 motion-safe:block motion-safe:animate-[sl-car-left_18s_linear_infinite]">
                  <div className="absolute top-1/2 -left-12 h-4 w-12 -translate-y-1/2 rounded-full bg-linear-to-l from-lamp/50 to-transparent" />
                  <div className="h-5 w-12 rounded-md bg-night-muted" />
                  <div className="absolute top-1 right-0 h-1 w-1 rounded-full bg-night-danger" />
                  <div className="absolute right-0 bottom-1 h-1 w-1 rounded-full bg-night-danger" />
                </div>
                <div className="absolute bottom-3 hidden h-5 w-12 motion-safe:block motion-safe:animate-[sl-car-right_13s_linear_infinite_-5s]">
                  <div className="absolute top-1/2 -right-12 h-4 w-12 -translate-y-1/2 rounded-full bg-linear-to-r from-lamp/50 to-transparent" />
                  <div className="h-5 w-12 rounded-md bg-pole" />
                  <div className="absolute top-1 left-0 h-1 w-1 rounded-full bg-night-danger" />
                  <div className="absolute bottom-1 left-0 h-1 w-1 rounded-full bg-night-danger" />
                </div>
              </div>
              <div className="h-12 border-t-2 border-pole/40 bg-pole/15" />
            </div>

            <ul
              aria-label={tStreet('zone.streetLabel', {
                zone: road.name,
                count: road.poles.length,
              })}
              className="relative flex"
            >
              {road.poles.map((pole, index) => {
                const far = index % 2 === 0;
                const match = !statusFilter || pole.lightStatus === statusFilter;
                const glow =
                  pole.lightStatus === 'ON'
                    ? 'opacity-70'
                    : pole.lightStatus === 'DIMMED'
                      ? 'opacity-40'
                      : 'opacity-0';
                const number = (
                  <span
                    className={cn(
                      'rounded bg-road px-1 py-0.5 font-mono text-[0.6875rem] leading-none tabular-nums',
                      pole.lightStatus === 'FAULT'
                        ? 'font-bold text-night-danger'
                        : pole.lightStatus === 'OFFLINE'
                          ? 'font-bold text-night-warning'
                          : 'text-night-muted group-hover:text-night-foreground',
                    )}
                  >
                    {shortPoleNumber(pole.code)}
                  </span>
                );
                const link = (
                  <Link
                    href={`/poles/${pole.id}`}
                    aria-label={tStreet('zone.poleLabel', { detail: detail(pole) })}
                    onMouseEnter={() => setFocused(pole)}
                    onFocus={() => setFocused(pole)}
                    className={cn(
                      'group relative z-10 flex w-11 flex-col items-center gap-1 rounded-lg py-1 transition-opacity focus-visible:outline-offset-0',
                      match ? 'opacity-100' : 'opacity-20',
                      focused?.id === pole.id && 'bg-night-soft/80',
                    )}
                  >
                    {far ? number : null}
                    <StreetPole
                      status={STREET_STATUS[pole.lightStatus]}
                      dimPercent={pole.dimPercent}
                      size="md"
                    />
                    {far ? null : number}
                  </Link>
                );
                return (
                  <li key={pole.id} className="flex w-11 flex-col items-center">
                    {/* Far footpath */}
                    <div className="flex h-36 items-end">{far ? link : null}</div>
                    {/* Light pool on the road under this pole */}
                    <div aria-hidden="true" className="relative h-22 w-11">
                      <div
                        className={cn(
                          'absolute left-1/2 h-10 w-24 -translate-x-1/2 rounded-[50%] bg-lamp blur-lg transition-opacity duration-700',
                          far ? 'top-1' : 'bottom-1',
                          match ? glow : 'opacity-0',
                        )}
                      />
                    </div>
                    {/* Near footpath: the pole stands in front and leans over the road */}
                    <div className="-mt-12 flex min-h-36 items-start">{far ? null : link}</div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <p
        aria-live="polite"
        className="min-h-10 border-t border-border bg-surface-subtle px-4 py-2 text-sm text-muted-foreground"
      >
        {focused ? (
          <>
            <span className="font-semibold text-foreground">{detail(focused)}</span>
            {' · '}
            {tStreet('zone.openHint')}
          </>
        ) : (
          tStreet('zone.hint')
        )}
      </p>
    </section>
  );
}
