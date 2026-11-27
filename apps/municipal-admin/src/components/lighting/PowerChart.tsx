'use client';

import type { PoleLiveDto } from '@smart-light/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

type Reading = PoleLiveDto['readings'][number];

const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 44, left: 48 };
const BAND = 8; // lamp on/off strip under the plot
/** Readings further apart than this are drawn as a gap (controller offline). */
const GAP_MS = 15 * 60_000;
/** India has no daylight saving: ticks fall on whole IST hours. */
const IST_OFFSET_MS = 5.5 * 3_600_000;

/** A round tick step giving about four intervals up to `peak`. */
function niceStep(peak: number): number {
  if (peak <= 0) return 2.5;
  const rough = peak / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= rough) ?? 10;
  return step * power;
}

/** Width of the chart's container, so the SVG is drawn 1:1 and its text never stretches. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry!.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Power draw over the last 24 h: one series, one axis, a lamp on/off strip, a
 * crosshair tooltip (mouse, touch and arrow keys) and an hourly table view.
 */
export function PowerChart({ readings }: { readings: PoleLiveDto['readings'] }) {
  const t = useTranslations('Lighting.pole.power');
  const format = useFormatter();
  const [containerRef, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const descriptionId = useId();

  const model = useMemo(() => {
    const times = readings.map((reading) => new Date(reading.at).getTime());
    const first = times[0] ?? 0;
    const last = times.at(-1) ?? 0;
    const peak = readings.reduce((max, reading) => Math.max(max, reading.powerW), 0);
    const step = niceStep(peak);
    const yMax = Math.max(step, Math.ceil(peak / step) * step);
    return { times, first, last, span: Math.max(1, last - first), peak, step, yMax };
  }, [readings]);

  if (readings.length < 2) return null;

  const plotWidth = Math.max(1, width - PAD.left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (time: number) => PAD.left + ((time - model.first) / model.span) * plotWidth;
  const y = (watts: number) => PAD.top + plotHeight - (watts / model.yMax) * plotHeight;
  const baseline = PAD.top + plotHeight;

  // Split into segments at gaps so an offline controller is not drawn as a flat line.
  const segments: number[][] = [];
  model.times.forEach((time, index) => {
    const previous = model.times[index - 1];
    if (index === 0 || previous === undefined || time - previous > GAP_MS) segments.push([]);
    segments.at(-1)!.push(index);
  });
  const linePath = (indexes: number[]) =>
    indexes
      .map(
        (index, position) =>
          `${position === 0 ? 'M' : 'L'}${x(model.times[index]!).toFixed(1)},${y(readings[index]!.powerW).toFixed(1)}`,
      )
      .join(' ');

  const yTicks = Array.from(
    { length: Math.round(model.yMax / model.step) + 1 },
    (_, index) => index * model.step,
  );
  const hour = 3_600_000;
  // About one time label per 80 px, on round hours.
  const maxLabels = Math.max(2, Math.floor(plotWidth / 80));
  const tickStep =
    [1, 2, 3, 6, 12, 24]
      .map((hours) => hours * hour)
      .find((step) => model.span / step <= maxLabels) ?? 24 * hour;
  const xTicks: number[] = [];
  for (
    let tick = Math.ceil((model.first + IST_OFFSET_MS) / tickStep) * tickStep - IST_OFFSET_MS;
    tick <= model.last;
    tick += tickStep
  ) {
    xTicks.push(tick);
  }

  const time = (value: number) => format.dateTime(new Date(value), { timeStyle: 'short' });
  const watts = (value: number) => format.number(value, { maximumFractionDigits: 1 });
  const lampText = (reading: Reading) =>
    reading.lampOn ? t('lampOnAt', { value: reading.dimPercent }) : t('lampOff');

  function pick(clientX: number, target: SVGSVGElement) {
    const left = target.getBoundingClientRect().left;
    const at = model.first + ((clientX - left - PAD.left) / plotWidth) * model.span;
    let best = 0;
    model.times.forEach((value, index) => {
      if (Math.abs(value - at) < Math.abs(model.times[best]! - at)) best = index;
    });
    setActive(best);
  }

  function onKey(event: KeyboardEvent<SVGSVGElement>) {
    const lastIndex = readings.length - 1;
    const current = active ?? lastIndex;
    const moves: Record<string, number> = {
      ArrowLeft: current - 1,
      ArrowRight: current + 1,
      Home: 0,
      End: lastIndex,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActive(Math.min(lastIndex, Math.max(0, next)));
  }

  const selected = active === null ? null : readings[active]!;
  const selectedX = active === null ? 0 : x(model.times[active]!);
  const tipWidth = 150;
  const tipX = Math.min(Math.max(selectedX - tipWidth / 2, PAD.left), width - PAD.right - tipWidth);

  // Hourly table: average and peak power, share of readings with the lamp on.
  const hours = new Map<number, Reading[]>();
  readings.forEach((reading, index) => {
    const key = Math.floor((model.times[index]! + IST_OFFSET_MS) / hour);
    hours.set(key, [...(hours.get(key) ?? []), reading]);
  });

  return (
    <figure className="grid gap-3">
      <div ref={containerRef} className="relative w-full">
        {width > 0 ? (
          <svg
            role="img"
            tabIndex={0}
            aria-label={t('label', { peak: watts(model.peak) })}
            aria-describedby={descriptionId}
            width={width}
            height={HEIGHT}
            className="block touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onPointerMove={(event) => pick(event.clientX, event.currentTarget)}
            onPointerDown={(event) => pick(event.clientX, event.currentTarget)}
            onPointerLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
            onKeyDown={onKey}
          >
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
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted-foreground text-[11px] tabular-nums"
                >
                  {`${watts(tick)} W`}
                </text>
              </g>
            ))}
            {xTicks.map((tick) => (
              <text
                key={tick}
                x={x(tick)}
                y={HEIGHT - 6}
                // Keep the first and last labels inside the chart.
                textAnchor={
                  x(tick) > width - PAD.right - 28
                    ? 'end'
                    : x(tick) < PAD.left + 28
                      ? 'start'
                      : 'middle'
                }
                className="fill-muted-foreground text-[11px]"
              >
                {time(tick)}
              </text>
            ))}

            {segments.map((indexes) => {
              const first = indexes[0]!;
              const last = indexes.at(-1)!;
              const path = linePath(indexes);
              return (
                <g key={first}>
                  <path
                    d={`${path} L${x(model.times[last]!).toFixed(1)},${baseline} L${x(model.times[first]!).toFixed(1)},${baseline} Z`}
                    className="fill-primary/12"
                  />
                  <path
                    d={path}
                    className="fill-none stroke-primary"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}

            {/* Lamp on/off strip; the legend and tooltip say the same in words. */}
            {readings.map((reading, index) => {
              const next = model.times[index + 1];
              const start = x(model.times[index]!);
              const end =
                next !== undefined && next - model.times[index]! <= GAP_MS ? x(next) : start + 2;
              return (
                <rect
                  key={reading.at}
                  x={start}
                  y={baseline + 6}
                  width={Math.max(1, end - start)}
                  height={BAND}
                  className={reading.lampOn ? 'fill-lamp' : 'fill-border'}
                />
              );
            })}

            {selected ? (
              <g pointerEvents="none">
                <line
                  x1={selectedX}
                  x2={selectedX}
                  y1={PAD.top}
                  y2={baseline}
                  className="stroke-foreground/40"
                />
                <circle
                  cx={selectedX}
                  cy={y(selected.powerW)}
                  r={5}
                  className="fill-primary stroke-surface"
                  strokeWidth={2}
                />
                <rect
                  x={tipX}
                  y={PAD.top}
                  width={tipWidth}
                  height={58}
                  rx={8}
                  className="fill-surface stroke-border"
                />
                <text x={tipX + 10} y={PAD.top + 18} className="fill-muted-foreground text-[11px]">
                  {format.dateTime(new Date(selected.at), {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </text>
                <text
                  x={tipX + 10}
                  y={PAD.top + 34}
                  className="fill-foreground text-[13px] font-semibold tabular-nums"
                >
                  {`${watts(selected.powerW)} W · ${watts(selected.voltageV)} V`}
                </text>
                <text x={tipX + 10} y={PAD.top + 50} className="fill-muted-foreground text-[11px]">
                  {lampText(selected)}
                </text>
              </g>
            ) : null}
          </svg>
        ) : (
          <div className="h-[220px]" />
        )}
      </div>

      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-4 rounded bg-primary" />
            {t('legendPower')}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-4 rounded-sm bg-lamp" />
            {t('legendLampOn')}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-4 rounded-sm bg-border" />
            {t('legendLampOff')}
          </span>
        </span>
        <span id={descriptionId}>
          {t('summary', {
            peak: watts(model.peak),
            latest: watts(readings.at(-1)!.powerW),
            from: time(model.first),
            to: time(model.last),
          })}{' '}
          <span className="sr-only">{t('keys')}</span>
        </span>
      </figcaption>

      {model.peak === 0 ? <p className="text-sm text-muted-foreground">{t('allZero')}</p> : null}

      <details className="rounded-lg border border-border text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium">
          {t('table.toggle')}
        </summary>
        <div className="max-h-72 overflow-auto border-t border-border">
          <table className="w-full text-left tabular-nums">
            <caption className="sr-only">{t('table.caption')}</caption>
            <thead className="sticky top-0 bg-surface-subtle">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('table.hour')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('table.average')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('table.peak')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('table.lampOn')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...hours.entries()].map(([key, rows]) => (
                <tr key={key}>
                  <th scope="row" className="px-3 py-1.5 font-normal">
                    {time(key * hour - IST_OFFSET_MS)}
                  </th>
                  <td className="px-3 py-1.5 text-right">
                    {`${watts(rows.reduce((sum, row) => sum + row.powerW, 0) / rows.length)} W`}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {`${watts(Math.max(...rows.map((row) => row.powerW)))} W`}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {format.number(rows.filter((row) => row.lampOn).length / rows.length, {
                      style: 'percent',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
