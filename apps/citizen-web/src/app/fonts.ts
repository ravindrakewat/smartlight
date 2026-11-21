import { Inter, Noto_Sans_Devanagari } from 'next/font/google';

/* Self-hosted at build time by next/font: no runtime requests to Google. */

/** Latin text and numerals (tabular figures for dashboards). */
export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

/** Hindi text. Designed to sit comfortably next to Latin sans-serif fonts. */
export const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  variable: '--font-devanagari',
  display: 'swap',
});
