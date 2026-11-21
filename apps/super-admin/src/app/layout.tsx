import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ConsoleShell } from '@/components/ConsoleShell';
import { inter, notoDevanagari } from './fonts';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Metadata');
  return {
    title: { default: t('title'), template: `%s · ${t('title')}` },
    description: t('description'),
    /* Internal console: keep it out of search engines. */
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={`${inter.variable} ${notoDevanagari.variable}`}>
      <body>
        <NextIntlClientProvider>
          <ConsoleShell>{children}</ConsoleShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
