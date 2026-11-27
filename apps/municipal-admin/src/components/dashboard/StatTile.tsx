import { cn } from '@smart-light/ui';
import type { ReactNode } from 'react';

export type StatTone = 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'cyan';

/** Solid icon squares; full class names so Tailwind can find them. */
const ICON: Record<StatTone, string> = {
  blue: 'bg-primary text-primary-foreground',
  green: 'bg-success text-background',
  red: 'bg-danger text-background',
  orange: 'bg-warning text-background',
  purple: 'bg-accent-purple text-primary-foreground',
  cyan: 'bg-accent-cyan text-background',
};

/** Coloured edge of the card, matching the icon (decorative). */
const EDGE: Record<StatTone, string> = {
  blue: 'border-t-primary',
  green: 'border-t-success',
  red: 'border-t-danger',
  orange: 'border-t-warning',
  purple: 'border-t-accent-purple',
  cyan: 'border-t-accent-cyan',
};

/** Text colours that pass contrast on the card (the icon colour is not always text-safe). */
const TEXT: Record<StatTone, string> = {
  blue: 'text-primary',
  green: 'text-success',
  red: 'text-danger',
  orange: 'text-warning',
  purple: 'text-muted-foreground',
  cyan: 'text-info',
};

/**
 * Headline number with a solid icon square, as on the control-room dashboard.
 * `note` is the small coloured line under the label (e.g. "94.7 %").
 */
export function StatTile({
  label,
  value,
  note,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon: ReactNode;
  tone: StatTone;
  loading?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-xl border border-t-2 border-border bg-surface p-3 shadow-sm sm:p-4',
        EDGE[tone],
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-xl sm:size-12 [&_svg]:size-6',
          ICON[tone],
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-lg leading-tight font-bold break-words tabular-nums sm:text-xl">
          {loading ? (
            <span className="inline-block h-6 w-16 animate-pulse rounded bg-surface-subtle" />
          ) : (
            value
          )}
        </p>
        <p className="text-xs leading-snug text-muted-foreground sm:text-sm">{label}</p>
        {note ? (
          <p className={cn('text-xs font-semibold tabular-nums', TEXT[tone])}>{note}</p>
        ) : null}
      </div>
    </div>
  );
}
