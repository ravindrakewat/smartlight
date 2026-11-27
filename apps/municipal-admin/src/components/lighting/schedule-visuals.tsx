import type { ScheduleStep } from '@smart-light/shared';
import { cn } from '@smart-light/ui';
import { Clock, Lightbulb, LightbulbOff, SunDim, Sunrise, Sunset } from 'lucide-react';

/** Minutes after midnight → "HH:MM". */
export const toTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/** "HH:MM" → minutes after midnight (clamped to the day). */
export const fromTime = (value: string) => {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Math.min(1439, Number(hours) * 60 + Number(minutes));
};

const ANCHOR_STYLES: Record<ScheduleStep['anchor'], string> = {
  sunset: 'bg-night text-brand',
  sunrise: 'bg-warning-subtle text-warning',
  clock: 'bg-primary-subtle text-primary',
};

const ANCHOR_ICONS = { sunset: Sunset, sunrise: Sunrise, clock: Clock } as const;

/**
 * Round badge telling sunset, sunrise and fixed-time steps apart at a glance.
 * Decorative: the step's text label always says the same.
 */
export function AnchorIcon({
  anchor,
  className,
}: {
  anchor: ScheduleStep['anchor'];
  className?: string;
}) {
  const Icon = ANCHOR_ICONS[anchor];
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full [&_svg]:size-[1.125rem]',
        ANCHOR_STYLES[anchor],
        className,
      )}
    >
      <Icon />
    </span>
  );
}

/** Light output of a step: full, dimmed or off. Decorative, shown next to text. */
export function OutputIcon({ step, className }: { step: ScheduleStep; className?: string }) {
  const Icon = !step.on ? LightbulbOff : step.dimPercent >= 100 ? Lightbulb : SunDim;
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        'size-4 shrink-0',
        step.on ? 'text-primary' : 'text-muted-foreground',
        className,
      )}
    />
  );
}

/**
 * Rough local minute of a step, for "what comes next" only. The controller works
 * out the real sunset and sunrise for its pole every day.
 */
function approxMinute(step: ScheduleStep): number {
  if (step.anchor === 'clock') return step.atMinute;
  const base = step.anchor === 'sunset' ? 18 * 60 : 6 * 60;
  return (((base + step.offsetMinutes) % 1440) + 1440) % 1440;
}

/** Current minute of the day in India, whatever the browser's time zone. */
export function minuteInIndia(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value('hour') * 60 + value('minute');
}

/** The step that most likely runs next, or null for an empty plan. */
export function nextStep(steps: ScheduleStep[], now: Date): ScheduleStep | null {
  const current = minuteInIndia(now);
  let best: ScheduleStep | null = null;
  let bestWait = Infinity;
  for (const step of steps) {
    const wait = (((approxMinute(step) - current) % 1440) + 1440) % 1440 || 1440;
    if (wait < bestWait) {
      bestWait = wait;
      best = step;
    }
  }
  return best;
}
