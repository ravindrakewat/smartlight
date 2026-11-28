import { Card, cn } from '@smart-light/ui';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** Compact dark card with an icon title and an optional "view all" link. */
export function Panel({
  id,
  title,
  icon,
  link,
  actions,
  className,
  bodyClassName,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  link?: { href: string; label: string };
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <section aria-labelledby={id} className="flex flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-3">
          <h2 id={id} className="flex items-center gap-2 text-base font-semibold">
            <span aria-hidden="true" className="text-info [&_svg]:size-5">
              {icon}
            </span>
            {title}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {link ? (
              <Link
                href={link.href}
                className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                {link.label}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
          </div>
        </div>
        <div className={cn('flex-1 px-4 pb-4', bodyClassName)}>{children}</div>
      </section>
    </Card>
  );
}
