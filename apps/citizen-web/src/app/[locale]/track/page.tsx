import { PageHeader } from '@smart-light/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { TrackView } from '@/components/citizen/TrackView';
import { resolvePageLocale, type LocaleParams } from '@/i18n/page-locale';

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolvePageLocale(props);
  const t = await getTranslations({ locale, namespace: 'Track' });
  return { title: t('title'), description: t('description') };
}

export default async function TrackPage(props: LocaleParams) {
  await resolvePageLocale(props);
  const t = await getTranslations('Track');
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense>
        <TrackView />
      </Suspense>
    </div>
  );
}
