'use client';

import type { LightStatusName, PoleMapItemDto } from '@smart-light/shared';
import { cn, StreetPole, type StreetPoleStatus } from '@smart-light/ui';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

export const STREET_STATUS: Record<LightStatusName, StreetPoleStatus> = {
  ON: 'on',
  DIMMED: 'dimmed',
  OFF: 'off',
  FAULT: 'fault',
  OFFLINE: 'offline',
  UNKNOWN: 'unknown',
};

/** Order in which statuses are counted and shown (problems last, most visible). */
export const STREET_STATUS_ORDER: LightStatusName[] = [
  'ON',
  'DIMMED',
  'OFF',
  'FAULT',
  'OFFLINE',
  'UNKNOWN',
];

/** Short pole number for under the drawing: `IND-000245-3` → `245`. */
export function shortPoleNumber(code: string): string {
  const serial = code.split('-')[1];
  return serial ? String(Number(serial)) : code;
}

export interface ZoneStreetProps {
  /** Null for poles that are not in any zone. */
  zone: { id: string; code: string; name: string } | null;
  poles: PoleMapItemDto[];
  /** Poles not matching the current filters are faded, so the street stays whole. */
  isMatch?: (pole: PoleMapItemDto) => boolean;
  compact?: boolean;
  headingLevel?: 'h2' | 'h3';
}

/**
 * One zone drawn as a street at night: every pole in order along the road, lit or
 * dark as it is right now. Each pole is a link to its page.
 */
export function ZoneStreet({
  zone,
  poles,
  isMatch,
  compact = false,
  headingLevel = 'h2',
}: ZoneStreetProps) {
  const t = useTranslations('Streets');
  const tLight = useTranslations('LightStatus');
  const format = useFormatter();
  const [focused, setFocused] = useState<PoleMapItemDto | null>(null);
  const Heading = headingLevel;

  const counts = new Map<LightStatusName, number>();
  for (const pole of poles) {
    counts.set(pole.lightStatus, (counts.get(pole.lightStatus) ?? 0) + 1);
  }
  const measured = poles.length - (counts.get('UNKNOWN') ?? 0);
  const working = (counts.get('ON') ?? 0) + (counts.get('DIMMED') ?? 0) + (counts.get('OFF') ?? 0);
  const health = measured === 0 ? null : working / measured;
  const name = zone ? zone.name : t('zone.noZone');
  const headingId = `street-${zone?.id ?? 'none'}`;

  const detail = (pole: PoleMapItemDto) =>
    [
      pole.code,
      tLight(pole.lightStatus),
      (pole.lightStatus === 'ON' || pole.lightStatus === 'DIMMED') && pole.dimPercent !== null
        ? t('zone.brightness', { percent: pole.dimPercent })
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-2xl border border-border bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0">
          <Heading id={headingId} className="text-base font-semibold">
            {name}{' '}
            {zone ? (
              <span className="font-mono text-xs font-normal text-muted-foreground">
                {zone.code}
              </span>
            ) : null}
          </Heading>
          <p className="text-sm text-muted-foreground">
            {t('zone.poleCount', { count: poles.length })}
            {health !== null
              ? ` · ${t('zone.health', {
                  percent: format.number(health, { style: 'percent', maximumFractionDigits: 0 }),
                })}`
              : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {STREET_STATUS_ORDER.filter((status) => counts.get(status)).map((status) => (
              <li
                key={status}
                className={cn(
                  'flex items-center gap-1 tabular-nums',
                  status === 'FAULT' && 'font-semibold text-danger',
                  status === 'OFFLINE' && 'font-semibold text-warning',
                )}
              >
                <span className="flex h-7 w-5 items-center justify-center rounded bg-night">
                  <StreetPole status={STREET_STATUS[status]} size="xs" animated={false} />
                </span>
                <span>
                  {format.number(counts.get(status) ?? 0)}{' '}
                  <span className={cn(compact && 'sr-only')}>{tLight(status)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* The street at night */}
      <div className="relative bg-[radial-gradient(120%_100%_at_50%_0%,var(--color-night-soft),var(--color-night))]">
        <div className="overflow-x-auto">
          <ul
            aria-label={t('zone.streetLabel', { zone: name, count: poles.length })}
            className={cn(
              'relative flex min-w-max items-end px-4',
              compact ? 'pt-3 pb-1' : 'pt-6 pb-2',
            )}
          >
            {poles.map((pole) => {
              const match = isMatch ? isMatch(pole) : true;
              return (
                <li key={pole.id} className="relative z-10">
                  <Link
                    href={`/poles/${pole.id}`}
                    aria-label={t('zone.poleLabel', { detail: detail(pole) })}
                    onMouseEnter={() => setFocused(pole)}
                    onFocus={() => setFocused(pole)}
                    className={cn(
                      'group flex flex-col items-center rounded-lg transition-opacity focus-visible:outline-offset-0',
                      compact ? 'w-7 min-h-11' : 'w-11',
                      match ? 'opacity-100' : 'opacity-20',
                      focused?.id === pole.id && 'bg-night-soft',
                    )}
                  >
                    <StreetPole
                      status={STREET_STATUS[pole.lightStatus]}
                      dimPercent={pole.dimPercent}
                      size={compact ? 'sm' : 'md'}
                      animated={!compact}
                    />
                    {compact ? null : (
                      <span
                        className={cn(
                          'mt-1 rounded bg-road px-1 py-0.5 font-mono text-[0.6875rem] leading-none tabular-nums',
                          pole.lightStatus === 'FAULT'
                            ? 'font-bold text-night-danger'
                            : pole.lightStatus === 'OFFLINE'
                              ? 'font-bold text-night-warning'
                              : 'text-night-muted group-hover:text-night-foreground',
                        )}
                      >
                        {shortPoleNumber(pole.code)}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {/* Road with lane markings */}
          <div
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-x-0 flex items-center bg-road',
              compact ? 'bottom-0 h-3' : 'bottom-0 h-6',
            )}
          >
            <div className="h-0.5 w-full bg-[repeating-linear-gradient(90deg,var(--color-lamp)_0_18px,transparent_18px_40px)] opacity-25" />
          </div>
        </div>
      </div>

      {compact ? null : (
        <p
          aria-live="polite"
          className="min-h-10 border-t border-border bg-surface-subtle px-4 py-2 text-sm text-muted-foreground"
        >
          {focused ? (
            <>
              <span className="font-semibold text-foreground">{detail(focused)}</span>
              {' · '}
              {t('zone.openHint')}
            </>
          ) : (
            t('zone.hint')
          )}
        </p>
      )}
    </section>
  );
}
