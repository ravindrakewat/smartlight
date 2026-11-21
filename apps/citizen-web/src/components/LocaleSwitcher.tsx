'use client';

import { LOCALE_LABELS, SUPPORTED_LOCALES } from '@smart-light/shared';
import { LanguageSwitcher } from '@smart-light/ui';
import { hasLocale, useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

const OPTIONS = SUPPORTED_LOCALES.map((code) => ({ value: code, label: LOCALE_LABELS[code] }));

/** Switches language while staying on the same page (/hi/track ⇄ /en/track). */
export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('Common');
  const [isPending, startTransition] = useTransition();

  return (
    <LanguageSwitcher
      label={t('language')}
      value={locale}
      options={OPTIONS}
      disabled={isPending}
      onChange={(next) => {
        if (hasLocale(routing.locales, next)) {
          startTransition(() => router.replace(pathname, { locale: next }));
        }
      }}
    />
  );
}
