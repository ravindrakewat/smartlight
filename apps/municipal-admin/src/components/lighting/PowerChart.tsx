'use client';

import type { PoleLiveDto } from '@smart-light/shared';
import { useFormatter } from 'next-intl';

const WIDTH = 600;
const HEIGHT = 140;

/**
 * Power draw over the last 24 h as a light-weight SVG area chart.
 * The numbers are also given as text (latest and peak) for screen readers.
 */
export function PowerChart({
  readings,
  label,
  summary,
}: {
  readings: PoleLiveDto['readings'];
  label: string;
  summary: string;
}) {
  const format = useFormatter();
  if (readings.length < 2) {
    return null;
  }
  const first = new Date(readings[0]!.at).getTime();
  const last = new Date(readings.at(-1)!.at).getTime();
  const span = Math.max(1, last - first);
  const peak = Math.max(1, ...readings.map((reading) => reading.powerW));
  const points = readings.map((reading) => {
    const x = ((new Date(reading.at).getTime() - first) / span) * WIDTH;
    const y = HEIGHT - (reading.powerW / peak) * (HEIGHT - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M${points.join(' L')}`;
  const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;

  return (
    <figure className="grid gap-2">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-36 w-full"
      >
        <path d={area} className="fill-primary/15" />
        <path
          d={line}
          className="fill-none stroke-primary"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="flex justify-between text-xs text-muted-foreground">
        <span>{format.dateTime(new Date(first), { timeStyle: 'short' })}</span>
        <span>{summary}</span>
        <span>{format.dateTime(new Date(last), { timeStyle: 'short' })}</span>
      </figcaption>
    </figure>
  );
}
