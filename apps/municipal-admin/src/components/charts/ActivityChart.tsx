'use client';

import type { DashboardActivityDto } from '@smart-light/shared';
import { cn } from '@smart-light/ui';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

const LINE_HEIGHT = 190;
const BAR_HEIGHT = 44;
const PAD = { top: 12, right: 12, bottom: 22, left: 40 };

/** Rounds the axis maximum up to a friendly number. */
function niceMax(value: number): number {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/**
 * Controllers reporting and lamps lit over time (one axis, same unit), with new
 * faults as a separate bar strip under it. Hover or arrow keys show the values;
 * the same numbers are available as a table.
 */
export function ActivityChart({ data }: { data: DashboardActivityDto }) {
  const t = useTranslations('Dashboard.activity');
  const format = useFormatter();
  const { ref, width } = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const points = data.points;
  const count = points.length;
  const plotWidth = Math.max(0, width - PAD.left - PAD.right);
  const maxLine = niceMax(Math.max(...points.map((point) => point.reporting), 1));
  const maxFaults = Math.max(...points.map((point) => point.faults), 1);
  const empty = points.every((point) => point.reporting === 0 && point.faults === 0);

  const x = (index: number) =>
    PAD.left + (count <= 1 ? plotWidth / 2 : (index / (count - 1)) * plotWidth);
  const y = (value: number) =>
    PAD.top + (1 - value / maxLine) * (LINE_HEIGHT - PAD.top - PAD.bottom);
  const path = (key: 'reporting' | 'lit') =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`,
      )
      .join(' ');

  const tickLabel = (at: string) =>
    data.bucket === 'hour'
      ? format.dateTime(new Date(at), { hour: 'numeric' })
      : format.dateTime(new Date(at), { day: 'numeric', month: 'short' });
  const fullLabel = (at: string) =>
    data.bucket === 'hour'
      ? format.dateTime(new Date(at), { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      : format.dateTime(new Date(at), { weekday: 'short', day: 'numeric', month: 'short' });

  // About six labels along the x axis whatever the range.
  const labelEvery = Math.max(1, Math.ceil(count / 6));
  const yTicks = [0, maxLine / 2, maxLine];

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relative = (event.clientX - bounds.left - PAD.left) / Math.max(1, plotWidth);
    setActive(Math.max(0, Math.min(count - 1, Math.round(relative * (count - 1)))));
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      setActive((current) => Math.max(0, Math.min(count - 1, (current ?? count - 1) + step)));
    } else if (event.key === 'Escape') {
      setActive(null);
    }
  };

  const shown = active !== null ? points[active] : points[count - 1];

  return (
    <div className="grid gap-3">
      {/* Legend and the values at the pointer (or the latest bucket) */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-5 rounded-full bg-chart-1" />
            {t('reporting')}
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-5 rounded-full bg-chart-2" />
            {t('lit')}
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2.5 w-2 rounded-sm bg-danger" />
            {t('faults')}
          </li>
        </ul>
        {shown ? (
          <p aria-live="polite" className="text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">{fullLabel(shown.at)}</span>
            {' · '}
            {t('readout', {
              reporting: format.number(shown.reporting),
              lit: format.number(shown.lit),
              faults: format.number(shown.faults),
            })}
          </p>
        ) : null}
      </div>

      <div
        ref={ref}
        role="img"
        tabIndex={0}
        aria-label={t('chartLabel')}
        onPointerMove={pick}
        onPointerLeave={() => setActive(null)}
        onKeyDown={keys}
        onBlur={() => setActive(null)}
        className="relative touch-pan-y rounded-lg focus-visible:outline-offset-4"
      >
        {width > 0 ? (
          <svg width={width} height={LINE_HEIGHT + BAR_HEIGHT} aria-hidden="true" focusable="false">
            {/* Grid and y labels */}
            {yTicks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="stroke-border"
                  strokeDasharray={tick === 0 ? undefined : '3 4'}
                />
                <text
                  x={PAD.left - 8}
                  y={y(tick)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground text-[0.6875rem] tabular-nums"
                >
                  {format.number(tick)}
                </text>
              </g>
            ))}

            {/* X labels */}
            {points.map((point, index) =>
              index % labelEvery === 0 || index === count - 1 ? (
                <text
                  key={point.at}
                  x={x(index)}
                  y={LINE_HEIGHT - 4}
                  textAnchor={index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle'}
                  className="fill-muted-foreground text-[0.6875rem]"
                >
                  {tickLabel(point.at)}
                </text>
              ) : null,
            )}

            {/* Area under "reporting", then both lines */}
            <path
              d={`${path('reporting')} L${x(count - 1)},${y(0)} L${x(0)},${y(0)} Z`}
              className="fill-chart-1"
              opacity="0.08"
            />
            <path
              d={path('reporting')}
              fill="none"
              strokeWidth="2"
              strokeLinejoin="round"
              className="stroke-chart-1"
            />
            <path
              d={path('lit')}
              fill="none"
              strokeWidth="2"
              strokeLinejoin="round"
              className="stroke-chart-2"
            />

            {/* New faults: own strip, own scale */}
            <text
              x={PAD.left - 8}
              y={LINE_HEIGHT + BAR_HEIGHT / 2}
              dy="0.32em"
              textAnchor="end"
              className="fill-muted-foreground text-[0.6875rem]"
            >
              {format.number(maxFaults)}
            </text>
            {points.map((point, index) => {
              const barWidth = Math.max(2, Math.min(14, plotWidth / count - 3));
              const height = (point.faults / maxFaults) * (BAR_HEIGHT - 10);
              return point.faults > 0 ? (
                <rect
                  key={point.at}
                  x={x(index) - barWidth / 2}
                  y={LINE_HEIGHT + BAR_HEIGHT - 4 - height}
                  width={barWidth}
                  height={height}
                  rx="2"
                  className={cn('fill-danger', active !== null && active !== index && 'opacity-40')}
                />
              ) : null;
            })}
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={LINE_HEIGHT + BAR_HEIGHT - 4}
              y2={LINE_HEIGHT + BAR_HEIGHT - 4}
              className="stroke-border"
            />

            {/* Crosshair and markers */}
            {active !== null && points[active] ? (
              <g>
                <line
                  x1={x(active)}
                  x2={x(active)}
                  y1={PAD.top}
                  y2={LINE_HEIGHT + BAR_HEIGHT - 4}
                  className="stroke-muted-foreground"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={x(active)}
                  cy={y(points[active].reporting)}
                  r="4.5"
                  strokeWidth="2"
                  className="fill-chart-1 stroke-surface"
                />
                <circle
                  cx={x(active)}
                  cy={y(points[active].lit)}
                  r="4.5"
                  strokeWidth="2"
                  className="fill-chart-2 stroke-surface"
                />
              </g>
            ) : null}
          </svg>
        ) : (
          <div className="h-[234px]" />
        )}
        {empty ? (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground">
            {t('empty')}
          </p>
        ) : null}
      </div>

      <details className="text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary">
          {t('showTable')}
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('chartLabel')}</caption>
            <thead className="sticky top-0 bg-surface-subtle">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('when')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('reporting')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('lit')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('faults')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...points].reverse().map((point) => (
                <tr key={point.at}>
                  <th scope="row" className="px-3 py-1.5 font-normal">
                    {fullLabel(point.at)}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {format.number(point.reporting)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {format.number(point.lit)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {format.number(point.faults)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
