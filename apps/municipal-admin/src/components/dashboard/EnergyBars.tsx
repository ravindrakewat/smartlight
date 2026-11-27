'use client';

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
export function EnergyBars({ days }: { days: EnergyDay[] }) {
  const t = useTranslations('Dashboard.energy');
  const format = useFormatter();
  const peak = Math.max(...days.map((day) => day.energyKWh), 0);
  const kwh = (value: number) => format.number(value, { maximumFractionDigits: 1 });
  // Noon in India, so the weekday never shifts with the browser's time zone.
  const dayLabel = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00+05:30`), { day: 'numeric', month: 'numeric' });

  return (
    <figure className="grid gap-2">
      <div aria-hidden="true" className="flex h-40 items-end gap-2 border-b border-border sm:gap-3">
        {days.map((day) => {
          const height = peak > 0 ? Math.max(2, (day.energyKWh / peak) * 100) : 2;
          return (
            <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
              <span className="text-center text-[11px] text-muted-foreground tabular-nums">
                {kwh(day.energyKWh)}
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
      <div aria-hidden="true" className="flex gap-2 sm:gap-3">
        {days.map((day) => (
          <span
            key={day.date}
            className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground"
          >
            {dayLabel(day.date)}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{t('tableCaption')}</caption>
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
