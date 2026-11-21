/** Languages supported by every client application (GIGW 3.0: bilingual Hindi + English). */
export const SUPPORTED_LOCALES = ['hi', 'en'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

/** Each language labelled in its own script, as language switchers must show them. */
export const LOCALE_LABELS: Record<AppLocale, string> = {
  hi: 'हिन्दी',
  en: 'English',
};

/** Cookie used by the admin portals to remember the chosen language. */
export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
