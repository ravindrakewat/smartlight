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

/** A faint wash of the tile's colour on the border and background (decorative). */
const WASH: Record<StatTone, string> = {
  blue: 'border-primary/35 bg-primary/[0.06]',
  green: 'border-success/35 bg-success/[0.06]',
  red: 'border-danger/35 bg-danger/[0.06]',
  orange: 'border-warning/35 bg-warning/[0.06]',
  purple: 'border-accent-purple/40 bg-accent-purple/[0.07]',
  cyan: 'border-accent-cyan/35 bg-accent-cyan/[0.06]',
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
 * Headline number with a solid icon square, as on the control-room dashboard:
 * icon left, value and label beside it, the small coloured `note` in the bottom-right
 * corner. Give the value's unit as `unit` so it is set smaller than the number.
 */
export function StatTile({
  label,
  value,
  unit,
  note,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  icon: ReactNode;
  tone: StatTone;
  loading?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[4.75rem] min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 shadow-sm',
        WASH[tone],
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-12 shrink-0 place-items-center rounded-lg [&_svg]:size-6',
          ICON[tone],
        )}
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-xl leading-tight font-bold tabular-nums">
          {loading ? (
            <span className="inline-block h-6 w-16 animate-pulse rounded bg-surface-subtle" />
          ) : (
            <>
              {value}
              {unit ? <span className="ml-1 text-sm font-semibold">{unit}</span> : null}
            </>
          )}
        </p>
        <p className="text-xs leading-snug text-muted-foreground">{label}</p>
        {note ? (
          <p className={cn('self-end text-right text-xs font-semibold tabular-nums', TEXT[tone])}>
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}
