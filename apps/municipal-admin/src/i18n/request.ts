import { isAppLocale, LOCALE_COOKIE_NAME, type AppLocale } from '@smart-light/shared';
import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

/** Officers default to English and can switch to Hindi; the choice is kept in a cookie. */
const DEFAULT_LOCALE: AppLocale = 'en';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const requested = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const locale = isAppLocale(requested) ? requested : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: 'Asia/Kolkata',
  };
});
