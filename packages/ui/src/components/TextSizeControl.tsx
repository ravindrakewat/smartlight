'use client';

import { useEffect, useState } from 'react';
import { cn } from '../lib/cn';

const STORAGE_KEY = 'sl-text-scale';
const SCALES = [87.5, 100, 112.5, 125] as const;
const DEFAULT_INDEX = 1;

export interface TextSizeControlProps {
  labels: {
    group: string;
    decrease: string;
    reset: string;
    increase: string;
  };
  className?: string;
}

function applyScale(index: number): void {
  document.documentElement.style.fontSize = `${SCALES[index]}%`;
}

/**
 * GIGW 3.0 text resize control (A- / A / A+). The choice is remembered per browser.
 * Layouts use rem units, so the whole page scales.
 */
export function TextSizeControl({ labels, className }: TextSizeControlProps) {
  const [index, setIndex] = useState(DEFAULT_INDEX);

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(STORAGE_KEY));
      if (Number.isInteger(stored) && stored >= 0 && stored < SCALES.length) {
        setIndex(stored);
        applyScale(stored);
      }
    } catch {
      /* Storage unavailable (private mode): keep the default size. */
    }
  }, []);

  function update(next: number): void {
    const clamped = Math.min(Math.max(next, 0), SCALES.length - 1);
    setIndex(clamped);
    applyScale(clamped);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      /* Ignore: the size still applies for this visit. */
    }
  }

  const buttonClass =
    'grid min-h-8 min-w-8 cursor-pointer place-items-center rounded-md px-1.5 font-semibold text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div
      role="group"
      aria-label={labels.group}
      className={cn('flex items-center gap-0.5', className)}
    >
      <button
        type="button"
        className={cn(buttonClass, 'text-xs')}
        aria-label={labels.decrease}
        disabled={index === 0}
        onClick={() => update(index - 1)}
      >
        A-
      </button>
      <button
        type="button"
        className={cn(buttonClass, 'text-sm')}
        aria-label={labels.reset}
        aria-pressed={index === DEFAULT_INDEX}
        onClick={() => update(DEFAULT_INDEX)}
      >
        A
      </button>
      <button
        type="button"
        className={cn(buttonClass, 'text-base')}
        aria-label={labels.increase}
        disabled={index === SCALES.length - 1}
        onClick={() => update(index + 1)}
      >
        A+
      </button>
    </div>
  );
}
