import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PoleView } from '@/components/citizen/PoleView';
import { resolvePageLocale } from '@/i18n/page-locale';

interface PolePageProps {
  params: Promise<{ locale: string; code: string }>;
}

/** Opened by scanning the QR plate on a pole: https://<city>.<domain>/p/IND-004182-7 */
export async function generateMetadata(props: PolePageProps): Promise<Metadata> {
  const locale = await resolvePageLocale(props);
  const { code } = await props.params;
  const t = await getTranslations({ locale, namespace: 'Pole' });
  return {
    title: t('title', { code: decodeURIComponent(code).toUpperCase() }),
    robots: { index: false },
  };
}

export default async function PolePage(props: PolePageProps) {
  await resolvePageLocale(props);
  const { code } = await props.params;
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <PoleView code={decodeURIComponent(code)} />
    </div>
  );
}
