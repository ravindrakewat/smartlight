import { PageHeader } from '@smart-light/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { ReportFlow } from '@/components/citizen/ReportFlow';
import { resolvePageLocale, type LocaleParams } from '@/i18n/page-locale';

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolvePageLocale(props);
  const t = await getTranslations({ locale, namespace: 'Report' });
  return { title: t('title'), description: t('description') };
}

export default async function ReportPage(props: LocaleParams) {
  await resolvePageLocale(props);
  const t = await getTranslations('Report');
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense>
        <ReportFlow />
      </Suspense>
    </div>
  );
}
