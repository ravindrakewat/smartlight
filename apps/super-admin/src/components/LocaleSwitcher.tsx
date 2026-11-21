'use client';

import { LOCALE_COOKIE_NAME, LOCALE_LABELS, SUPPORTED_LOCALES } from '@smart-light/shared';
import { LanguageSwitcher } from '@smart-light/ui';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const OPTIONS = SUPPORTED_LOCALES.map((code) => ({ value: code, label: LOCALE_LABELS[code] }));

export function LocaleSwitcher() {
  const locale = useLocale();
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
        document.cookie = `${LOCALE_COOKIE_NAME}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
        startTransition(() => router.refresh());
      }}
    />
  );
}
