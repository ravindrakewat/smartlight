import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { en, hi, type Messages } from './messages';

export type Locale = 'hi' | 'en';
const STORAGE_KEY = 'sl.locale';
const DICTIONARIES: Record<Locale, Messages> = { en, hi };

interface I18nValue {
  locale: Locale;
  messages: Messages;
  toggleLocale: () => void;
  /** Replaces `{name}` placeholders. */
  format: (template: string, values?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/** Field staff default to Hindi; the choice is remembered on the device. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('hi');

  useEffect(() => {
    void SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      if (stored === 'en' || stored === 'hi') {
        setLocale(stored);
      }
    });
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale((current) => {
      const next: Locale = current === 'hi' ? 'en' : 'hi';
      void SecureStore.setItemAsync(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      messages: DICTIONARIES[locale],
      toggleLocale,
      format: (template, values = {}) =>
        template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match)),
    }),
    [locale, toggleLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return value;
}

/** "in 5 hours" / "3 hours ago" in the current language. */
export function useRelativeTime(): (iso: string) => string {
  const { locale } = useI18n();
  return (iso) => {
    const diffMinutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
    const formatter = new Intl.RelativeTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
      numeric: 'auto',
    });
    if (Math.abs(diffMinutes) < 60) {
      return formatter.format(diffMinutes, 'minute');
    }
    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 48) {
      return formatter.format(diffHours, 'hour');
    }
    return formatter.format(Math.round(diffHours / 24), 'day');
  };
}
