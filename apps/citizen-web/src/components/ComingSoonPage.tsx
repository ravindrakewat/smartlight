import { Button, EmptyState, PageHeader } from '@smart-light/ui';
import { Construction } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

interface ComingSoonPageProps {
  title: string;
  description: string;
}

/** Placeholder for citizen services that are linked from the home page but not built yet. */
export async function ComingSoonPage({ title, description }: ComingSoonPageProps) {
  const t = await getTranslations('Common');

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader title={title} description={description} />
      <EmptyState
        className="min-h-80"
        icon={<Construction />}
        title={t('comingSoonTitle')}
        description={t('comingSoonDescription')}
        action={
          <Button asChild variant="outline">
            <Link href="/">{t('backHome')}</Link>
          </Button>
        }
      />
    </div>
  );
}
