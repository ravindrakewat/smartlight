'use client';

import { cn } from '@smart-light/ui';
import { useFormatter } from 'next-intl';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  /** Stroke and dot classes, e.g. `stroke-success` / `bg-success`. */
  strokeClass: string;
  dotClass: string;
}

export interface StatusDonutProps {
  slices: DonutSlice[];
  /** Big text in the middle, e.g. "77%". */
  centreValue: string;
  centreLabel: string;
  totalLabel: string;
  className?: string;
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Surface gap between slices, in the same units as the circumference. */
const GAP = 2.2;

/**
 * Share of poles per status as a ring, with a legend that states every count in
 * text, so colour is never the only carrier of the information.
 */
export function StatusDonut({
  slices,
  centreValue,
  centreLabel,
  totalLabel,
  className,
}: StatusDonutProps) {
  const format = useFormatter();
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const visible = slices.filter((slice) => slice.value > 0);
  let offset = 0;

  return (
    <div className={cn('flex flex-wrap items-center gap-6', className)}>
      <div className="relative size-44 shrink-0">
        <svg
          viewBox="0 0 100 100"
          aria-hidden="true"
          focusable="false"
          className="size-full -rotate-90"
        >
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="12"
            className="stroke-surface-subtle"
          />
          {total > 0
            ? visible.map((slice) => {
                const length = (slice.value / total) * CIRCUMFERENCE;
                const drawn = visible.length > 1 ? Math.max(0.5, length - GAP) : length;
                const element = (
                  <circle
                    key={slice.key}
                    cx="50"
                    cy="50"
                    r={RADIUS}
                    fill="none"
                    strokeWidth="12"
                    strokeDasharray={`${drawn} ${CIRCUMFERENCE - drawn}`}
                    strokeDashoffset={-offset}
                    className={slice.strokeClass}
                  />
                );
                offset += length;
                return element;
              })
            : null}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="text-3xl font-bold tabular-nums">{centreValue}</span>
          <span className="text-sm text-muted-foreground">{centreLabel}</span>
        </div>
      </div>

      <dl className="grid min-w-44 flex-1 gap-2 text-sm">
        {slices.map((slice) => (
          <div key={slice.key} className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2">
              <span aria-hidden="true" className={cn('size-2.5 rounded-full', slice.dotClass)} />
              {slice.label}
            </dt>
            <dd className="font-semibold tabular-nums">{format.number(slice.value)}</dd>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between gap-4 border-t border-border pt-2">
          <dt className="font-medium">{totalLabel}</dt>
          <dd className="font-bold tabular-nums">{format.number(total)}</dd>
        </div>
      </dl>
    </div>
  );
}
