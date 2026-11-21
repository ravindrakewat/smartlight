import { LOCALE_COOKIE_NAME, SUPPORTED_LOCALES } from '@smart-light/shared';
import { defineRouting } from 'next-intl/routing';

/**
 * Public portal: the language is part of the URL (/hi/..., /en/...) so each language
 * version is shareable and indexed by search engines. Hindi is the default; first-time
 * visitors whose browser prefers English are sent to /en.
 */
export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: 'hi',
  localePrefix: 'always',
  localeCookie: { name: LOCALE_COOKIE_NAME, maxAge: 60 * 60 * 24 * 365 },
});
