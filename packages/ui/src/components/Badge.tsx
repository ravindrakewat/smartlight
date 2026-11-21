import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { TONE_SUBTLE_CLASSES, type Tone } from '../lib/tones';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        TONE_SUBTLE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}
