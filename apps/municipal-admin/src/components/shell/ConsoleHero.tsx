'use client';

import { LiveIndicator, PageHero } from '@smart-light/ui';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { HeroBackground } from './HeroBackground';

export interface ConsoleHeroProps {
  title: string;
  accent?: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** Buttons shown under the banner, on the right. */
  actions?: ReactNode;
  /** Shorter banner (dashboard). */
  compact?: boolean;
}

/** Page banner with the live clock; carries the page's `h1`. */
export function ConsoleHero({
  title,
  accent,
  description,
  icon,
  actions,
  compact,
}: ConsoleHeroProps) {
  const t = useTranslations('Shell');
  const format = useFormatter();

  return (
    <>
      <PageHero
        title={title}
        accent={accent}
        description={description}
        icon={icon}
        background={<HeroBackground />}
        compact={compact}
        className={actions ? 'mb-4' : undefined}
        aside={
          <LiveIndicator
            label={t('live')}
            formatTime={(now) => format.dateTime(now, { dateStyle: 'medium', timeStyle: 'short' })}
          />
        }
      />
      {actions ? (
        <div className="mb-6 flex flex-wrap items-center justify-end gap-3">{actions}</div>
      ) : null}
    </>
  );
}
