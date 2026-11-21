import { cn } from '../lib/cn';
import { TONE_DOT_CLASSES, type Tone } from '../lib/tones';

export type LightStatus = 'on' | 'dimmed' | 'off' | 'fault' | 'offline';

const STATUS_TONES: Record<LightStatus, Tone> = {
  on: 'success',
  dimmed: 'info',
  off: 'neutral',
  fault: 'danger',
  offline: 'warning',
};

export interface StatusIndicatorProps {
  status: LightStatus;
  /** Visible, translated label — status is never shown by colour alone. */
  label: string;
  className?: string;
}

export function StatusIndicator({ status, label, className }: StatusIndicatorProps) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm font-medium', className)}>
      <span
        aria-hidden="true"
        className={cn('size-2.5 shrink-0 rounded-full', TONE_DOT_CLASSES[STATUS_TONES[status]])}
      />
      {label}
    </span>
  );
}
