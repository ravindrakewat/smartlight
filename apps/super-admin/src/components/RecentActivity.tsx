'use client';

import type { AuditEntryDto } from '@smart-light/shared';
import { cn } from '@smart-light/ui';
import { ShieldAlert } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { auditCategory, isSecurityEvent } from '@/lib/audit';

/** A short timeline of the latest audit entries across the platform. */
export function RecentActivity({ entries }: { entries: AuditEntryDto[] }) {
  const t = useTranslations('Audit');
  const format = useFormatter();
  const now = new Date();

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <ol className="divide-y divide-border">
      {entries.map((entry) => {
        const category = auditCategory(entry.action);
        const security = isSecurityEvent(entry.action);
        return (
          <li key={entry.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5 text-sm">
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
                security
                  ? 'bg-danger-subtle text-danger'
                  : 'bg-surface-subtle text-muted-foreground',
              )}
            >
              {security ? <ShieldAlert aria-hidden="true" className="size-3.5" /> : null}
              {category ? t(`categories.${category}`) : t('categories.other')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-mono text-xs">{entry.action}</span>
              <span className="block text-muted-foreground">
                {[entry.actor ?? t(`actorTypes.${entry.actorType}`), entry.tenant?.name]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <time
              dateTime={entry.createdAt}
              className="shrink-0 text-xs text-muted-foreground tabular-nums"
            >
              {format.relativeTime(new Date(entry.createdAt), now)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
