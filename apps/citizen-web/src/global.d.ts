import type { routing } from './i18n/routing';
import type messages from '../messages/en.json';

/* Type-safe translations: an unknown message key is a compile error. */
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
