import { notFound } from 'next/navigation';
import { hasLocale, type Locale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { routing } from './routing';

export interface LocaleParams {
  params: Promise<{ locale: string }>;
}

/** Validates the `[locale]` segment (404 for unknown ones) and enables static rendering. */
export async function resolvePageLocale({ params }: LocaleParams): Promise<Locale> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  return locale;
}
