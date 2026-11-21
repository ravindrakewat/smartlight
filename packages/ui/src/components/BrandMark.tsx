import { cn } from '../lib/cn';

export interface BrandMarkProps {
  className?: string;
}

/** Street-light logo mark: lamp head with a warm glow on the primary colour. */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[62%]">
        <path
          d="M7 21V6.5A3.5 3.5 0 0 1 10.5 3H15"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M12.5 5.5h6a1 1 0 0 1 .9 1.45L18.5 8.5h-5L12.6 6.95a1 1 0 0 1-.1-1.45Z"
          fill="currentColor"
        />
        <path
          d="M13.5 11.5 12.5 14M16 11.5v3M18.5 11.5l1 2.5"
          stroke="var(--color-brand)"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path d="M4.5 21h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}
