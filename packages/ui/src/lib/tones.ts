/** Semantic tones shared by badges, stat cards and status indicators. */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Full class names are listed so Tailwind can detect them at build time. */
export const TONE_SUBTLE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-neutral-subtle text-neutral',
  info: 'bg-info-subtle text-info',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
};

export const TONE_DOT_CLASSES: Record<Tone, string> = {
  neutral: 'bg-neutral',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};
