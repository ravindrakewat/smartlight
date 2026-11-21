import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { TONE_SUBTLE_CLASSES, type Tone } from '../lib/tones';

export interface AlertProps {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/** Inline message. Errors are announced to screen readers immediately. */
export function Alert({ tone = 'info', title, children, icon, className }: AlertProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-xl px-4 py-3 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0',
        TONE_SUBTLE_CLASSES[tone],
        className,
      )}
    >
      {icon}
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5' : undefined}>{children}</div> : null}
      </div>
    </div>
  );
}

/** Loading placeholder; respects reduced motion via the global stylesheet. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-lg bg-surface-subtle', className)}
      {...props}
    />
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  labels: { previous: string; next: string; status: string };
  className?: string;
}

/** Previous / next pager. `labels.status` is pre-formatted, e.g. "Page 2 of 9". */
export function Pagination({ page, totalPages, onChange, labels, className }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }
  const buttonClass =
    'h-10 cursor-pointer rounded-lg border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <nav
      aria-label={labels.status}
      className={cn('flex items-center justify-between gap-3', className)}
    >
      <button
        type="button"
        className={buttonClass}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        {labels.previous}
      </button>
      <span className="text-sm text-muted-foreground tabular-nums">{labels.status}</span>
      <button
        type="button"
        className={buttonClass}
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        {labels.next}
      </button>
    </nav>
  );
}
