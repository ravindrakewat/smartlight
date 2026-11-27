import type { ReactNode } from 'react';

export interface ConsoleHeroProps {
  title: string;
  accent?: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** Buttons shown at the top of the page, on the right. */
  actions?: ReactNode;
  /** Kept for callers; the page no longer has a banner. */
  compact?: boolean;
}

/**
 * The page's `h1` without a visible banner (the console shows no page banner; the
 * sidebar marks where you are). The title stays for screen readers and the page
 * outline, and the page's action buttons stay at the top right.
 */
export function ConsoleHero({ title, accent, description, actions }: ConsoleHeroProps) {
  return (
    <>
      <div className="sr-only">
        <h1>{accent ? `${title} ${accent}` : title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-3">{actions}</div>
      ) : null}
    </>
  );
}
