import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { TONE_SUBTLE_CLASSES, type Tone } from '../lib/tones';

export interface StatCardProps {
  label: string;
  /** Pre-formatted value (use the app's locale-aware number formatter). */
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone?: Tone;
  className?: string;
}

/** KPI tile. The value gets the full card width so large numbers never wrap. */
export function StatCard({ label, value, hint, icon, tone = 'neutral', className }: StatCardProps) {
  return (
    <div className={cn('rounded-2xl border border-border bg-surface p-5 shadow-xs', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon ? (
          <span
            aria-hidden="true"
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-[1.125rem]',
              TONE_SUBTLE_CLASSES[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold whitespace-nowrap tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
