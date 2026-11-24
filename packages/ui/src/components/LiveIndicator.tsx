'use client';

import { useEffect, useState } from 'react';
import { cn } from '../lib/cn';

export interface LiveIndicatorProps {
  /** e.g. "Live" */
  label: string;
  /** Formats the current time in the viewer's locale and the city's time zone. */
  formatTime: (now: Date) => string;
  className?: string;
}

/** "Live" badge with a pulsing dot and a clock that ticks every 30 seconds. */
export function LiveIndicator({ label, formatTime, className }: LiveIndicatorProps) {
  // Rendered empty on the server so the clock never mismatches during hydration.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className={cn(
        'rounded-xl border border-night-foreground/20 bg-night/70 px-4 py-2.5 backdrop-blur',
        className,
      )}
    >
      <p className="flex items-center gap-2 text-lg font-semibold text-night-foreground">
        <span className="relative flex size-3" aria-hidden="true">
          <span className="absolute inline-flex size-full rounded-full bg-success opacity-70 motion-safe:animate-ping" />
          <span className="relative inline-flex size-3 rounded-full bg-[color-mix(in_oklab,var(--color-success),white_25%)]" />
        </span>
        {label}
      </p>
      <p className="min-h-5 text-sm text-night-foreground/90 tabular-nums">
        {now ? <time dateTime={now.toISOString()}>{formatTime(now)}</time> : null}
      </p>
    </div>
  );
}
