import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import type { Tone } from '../lib/tones';

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: Tone;
  /** Line under the value, e.g. "77% of all poles". */
  hint?: ReactNode;
  /** Share 0–1 drawn as a bar under the hint. Decorative: say the same in `hint`. */
  share?: number | null;
  /** Makes the card a toggle button (e.g. a filter). */
  pressed?: boolean;
  onClick?: () => void;
  className?: string;
}

/** Solid icon circles; full class names so Tailwind can find them. */
const ICON_CLASSES: Record<Tone, string> = {
  info: 'bg-primary text-primary-foreground shadow-primary/40',
  success: 'bg-success text-primary-foreground shadow-success/40',
  warning: 'bg-brand text-night shadow-brand/40',
  danger: 'bg-danger text-primary-foreground shadow-danger/40',
  neutral: 'bg-neutral text-primary-foreground shadow-neutral/30',
};

const BAR_CLASSES: Record<Tone, string> = {
  info: '[&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary',
  success: '[&::-webkit-progress-value]:bg-success [&::-moz-progress-bar]:bg-success',
  warning: '[&::-webkit-progress-value]:bg-brand [&::-moz-progress-bar]:bg-brand',
  danger: '[&::-webkit-progress-value]:bg-danger [&::-moz-progress-bar]:bg-danger',
  neutral: '[&::-webkit-progress-value]:bg-neutral [&::-moz-progress-bar]:bg-neutral',
};

/** Headline number with a coloured icon and an optional share bar. */
export function KpiCard({
  label,
  value,
  icon,
  tone = 'neutral',
  hint,
  share,
  pressed,
  onClick,
  className,
}: KpiCardProps) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'grid size-12 shrink-0 place-items-center rounded-full shadow-lg [&_svg]:size-6',
          ICON_CLASSES[tone],
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-muted-foreground">{label}</span>
        <span className="block text-2xl font-bold tabular-nums">{value}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
        {share !== undefined && share !== null ? (
          <progress
            aria-hidden="true"
            max={1}
            value={Math.max(0, Math.min(1, share))}
            className={cn(
              'mt-2 block h-1.5 w-full appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-surface-subtle [&::-webkit-progress-value]:rounded-full',
              'bg-surface-subtle',
              BAR_CLASSES[tone],
            )}
          />
        ) : null}
      </span>
    </>
  );

  const classes = cn(
    'flex min-h-28 items-center gap-4 rounded-2xl border bg-surface p-4 text-left shadow-sm transition-colors',
    pressed ? 'border-primary ring-2 ring-primary' : 'border-border',
    className,
  );

  return onClick ? (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(classes, 'cursor-pointer hover:border-primary/60')}
    >
      {body}
    </button>
  ) : (
    <div className={classes}>{body}</div>
  );
}
