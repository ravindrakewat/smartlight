'use client';

import { cn } from '@smart-light/ui';
import { useFormatter, useTranslations } from 'next-intl';

export interface EnergyDay {
  /** `YYYY-MM-DD`, India time. */
  date: string;
  energyKWh: number;
}

/**
 * Measured energy per day as bars. Each bar is its own small SVG (no inline
 * styles), the value is printed above it and the same numbers are in a table
 * for screen readers.
 */
export function EnergyBars({
  days,
  bucket = 'day',
  caption,
}: {
  days: EnergyDay[];
  /** `month` labels each bar with the month instead of the day. */
  bucket?: 'day' | 'month';
  /** Screen-reader caption of the table; defaults to the 7-day caption. */
  caption?: string;
}) {
  const t = useTranslations('Dashboard.energy');
  const format = useFormatter();
  const peak = Math.max(...days.map((day) => day.energyKWh), 0);
  const kwh = (value: number) => format.number(value, { maximumFractionDigits: 1 });
  // Noon in India, so the weekday never shifts with the browser's time zone.
  const dayLabel = (date: string) =>
    format.dateTime(
      new Date(`${date}T12:00:00+05:30`),
      bucket === 'month' ? { month: 'short' } : { day: 'numeric', month: 'numeric' },
    );
  // With many bars, print the values and dates only on every n-th bar so they never collide.
  const every = days.length <= 8 ? 1 : Math.ceil(days.length / 6);
  // Narrow gaps when there are many bars, so a month still fits a phone.
  const gap = every === 1 ? 'gap-2 sm:gap-3' : 'gap-0.5 sm:gap-1.5';
  const shown = (index: number) => index % every === 0;

  return (
    <figure className="grid min-w-0 gap-2">
      <div aria-hidden="true" className={cn('flex h-40 items-end border-b border-border', gap)}>
        {days.map((day) => {
          const height = peak > 0 ? Math.max(2, (day.energyKWh / peak) * 100) : 2;
          return (
            <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
              <span className="text-center text-[11px] text-muted-foreground tabular-nums">
                {every === 1 ? kwh(day.energyKWh) : <>&nbsp;</>}
              </span>
              <svg
                viewBox="0 0 10 100"
                preserveAspectRatio="none"
                className="h-[calc(100%-1.25rem)] w-full"
              >
                <rect
                  x="1"
                  y={100 - height}
                  width="8"
                  height={height}
                  rx="1.5"
                  className="fill-accent-cyan"
                />
              </svg>
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className={cn('flex overflow-hidden', gap)}>
        {days.map((day, index) => (
          <span
            key={day.date}
            className="min-w-0 flex-1 text-center text-[11px] whitespace-nowrap text-muted-foreground"
          >
            {shown(index) ? dayLabel(day.date) : null}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption ?? t('tableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('day')}</th>
            <th scope="col">{t('kwh')}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th scope="row">{dayLabel(day.date)}</th>
              <td>{kwh(day.energyKWh)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
