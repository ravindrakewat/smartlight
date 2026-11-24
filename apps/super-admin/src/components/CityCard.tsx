'use client';

import type { LightStatusName, TenantDto } from '@smart-light/shared';
import { cn, StreetPole, type StreetPoleStatus } from '@smart-light/ui';
import { ArrowRight, ClipboardList, Wifi } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { TenantStatusBadge } from './TenantsTable';

export const POLE_STATUS: Record<LightStatusName, StreetPoleStatus> = {
  ON: 'on',
  DIMMED: 'dimmed',
  OFF: 'off',
  FAULT: 'fault',
  OFFLINE: 'offline',
  UNKNOWN: 'unknown',
};

/** Order along the little street: working lights first, problems at the end. */
const STREET_ORDER: LightStatusName[] = ['ON', 'DIMMED', 'OFF', 'FAULT', 'OFFLINE', 'UNKNOWN'];
const STREET_POLES = 14;

/**
 * Shares a fixed number of drawn poles between the statuses in proportion to the
 * real counts (largest remainder), so a single fault still shows up as one pole.
 */
function streetSample(lights: TenantDto['stats']['lights'], total: number): LightStatusName[] {
  if (total === 0) return [];
  const slots = Math.min(STREET_POLES, total);
  const shares = STREET_ORDER.map((status) => {
    const exact = ((lights[status] ?? 0) / total) * slots;
    return { status, count: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  // Every status that exists gets at least one pole.
  for (const share of shares) {
    if ((lights[share.status] ?? 0) > 0 && share.count === 0) {
      share.count = 1;
      share.rest = 0;
    }
  }
  let used = shares.reduce((sum, share) => sum + share.count, 0);
  for (const share of [...shares].sort((a, b) => b.rest - a.rest)) {
    if (used >= slots) break;
    if ((lights[share.status] ?? 0) > 0) {
      share.count += 1;
      used += 1;
    }
  }
  while (used > slots) {
    const largest = shares.reduce((a, b) => (b.count > a.count ? b : a));
    largest.count -= 1;
    used -= 1;
  }
  return shares.flatMap((share) => Array.from({ length: share.count }, () => share.status));
}

/** One municipality as a card: a little street at night, health and its numbers. */
export function CityCard({ tenant }: { tenant: TenantDto }) {
  const t = useTranslations('Overview.city');
  const tLight = useTranslations('LightStatus');
  const format = useFormatter();
  const locale = useLocale();
  const { stats } = tenant;
  // `?? {}` keeps the card working against an API that has not been redeployed yet.
  const lights = stats.lights ?? {};
  const openWorkOrders = stats.openWorkOrders ?? 0;
  const measured = stats.poles - (lights.UNKNOWN ?? 0);
  const working = (lights.ON ?? 0) + (lights.DIMMED ?? 0) + (lights.OFF ?? 0);
  const problems = (lights.FAULT ?? 0) + (lights.OFFLINE ?? 0);
  const health = measured === 0 ? null : working / measured;
  const percent = (value: number) =>
    format.number(value, { style: 'percent', maximumFractionDigits: 0 });
  const sample = streetSample(lights, stats.poles);
  const name = locale === 'hi' ? tenant.nameHi : tenant.name;
  const headingId = `city-${tenant.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface"
    >
      {/* The little street: decorative, the numbers below say the same in text */}
      <div
        aria-hidden="true"
        className="relative h-28 bg-[radial-gradient(130%_120%_at_50%_0%,var(--color-night-soft),var(--color-night))]"
      >
        <div className="absolute inset-x-0 bottom-0 h-4 bg-road">
          <div className="absolute inset-x-0 top-1/2 h-px bg-[repeating-linear-gradient(90deg,var(--color-lamp)_0_12px,transparent_12px_26px)] opacity-30" />
        </div>
        {sample.length > 0 ? (
          <div className="absolute inset-x-3 bottom-2 flex items-end justify-between">
            {sample.map((status, index) => (
              <StreetPole key={index} status={POLE_STATUS[status]} size="sm" />
            ))}
          </div>
        ) : (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-night-muted">
            {t('noPoles')}
          </p>
        )}
        {health !== null ? (
          <span
            className={cn(
              'absolute top-3 right-3 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums',
              health >= 0.95
                ? 'bg-success-subtle text-success'
                : health >= 0.85
                  ? 'bg-warning-subtle text-warning'
                  : 'bg-danger-subtle text-danger',
            )}
          >
            {t('health', { percent: percent(health) })}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id={headingId} className="text-base font-semibold">
              {name}
            </h3>
            <p className="font-mono text-xs text-muted-foreground">
              {tenant.code} · {tenant.slug}
            </p>
          </div>
          <TenantStatusBadge status={tenant.status} />
        </div>

        {stats.poles > 0 ? (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
            {STREET_ORDER.filter((status) => lights[status]).map((status) => (
              <li
                key={status}
                className={cn(
                  'flex items-center gap-1.5 tabular-nums',
                  status === 'FAULT' && 'font-semibold text-danger',
                  status === 'OFFLINE' && 'font-semibold text-warning',
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex h-6 w-4 items-center justify-center rounded bg-night"
                >
                  <StreetPole status={POLE_STATUS[status]} size="xs" animated={false} />
                </span>
                {format.number(lights[status] ?? 0)} {tLight(status)}
              </li>
            ))}
          </ul>
        ) : null}

        <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-border pt-3 text-sm">
          <div>
            <dt className="text-muted-foreground">{t('poles')}</dt>
            <dd className="font-semibold tabular-nums">{format.number(stats.poles)}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-muted-foreground">
              <Wifi aria-hidden="true" className="size-3.5" />
              {t('online')}
            </dt>
            <dd className="font-semibold tabular-nums">
              {stats.devices === 0 ? '—' : percent(stats.devicesOnline / stats.devices)}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-muted-foreground">
              <ClipboardList aria-hidden="true" className="size-3.5" />
              {t('openJobs')}
            </dt>
            <dd
              className={cn(
                'font-semibold tabular-nums',
                openWorkOrders > 0 && problems > 0 && 'text-danger',
              )}
            >
              {format.number(openWorkOrders)}
            </dd>
          </div>
        </dl>

        <Link
          href={`/devices?tenant=${tenant.id}`}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t('devicesLink', { city: name })}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </article>
  );
}
