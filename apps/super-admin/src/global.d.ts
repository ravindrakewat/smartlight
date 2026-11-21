import type { AppLocale } from '@smart-light/shared';
import type messages from '../messages/en.json';

/* Type-safe translations: an unknown message key is a compile error. */
declare module 'next-intl' {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof messages;
  }
}
