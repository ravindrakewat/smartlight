import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ComingSoonPage } from '@/components/ComingSoonPage';
import { resolvePageLocale, type LocaleParams } from '@/i18n/page-locale';

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolvePageLocale(props);
  const t = await getTranslations({ locale, namespace: 'Report' });
  return { title: t('title'), description: t('description') };
}

export default async function ReportPage(props: LocaleParams) {
  await resolvePageLocale(props);
  const t = await getTranslations('Report');
  return <ComingSoonPage title={t('title')} description={t('description')} />;
}
