export interface SkipLinkProps {
  /** Translated text, e.g. "Skip to main content". */
  label: string;
  /** id of the main landmark. */
  targetId?: string;
}

/** First focusable element on every page (GIGW 3.0 / WCAG 2.4.1 bypass blocks). */
export function SkipLink({ label, targetId = 'main-content' }: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2.5 focus:font-semibold focus:text-primary-foreground focus:shadow-lg"
    >
      {label}
    </a>
  );
}
