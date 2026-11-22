import { Button, EmptyState, PageHeader } from '@smart-light/ui';
import { Construction } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

/** Console sections that exist in the navigation but are not built yet. */
const SECTIONS = {
  devices: 'devices',
  firmware: 'firmware',
  users: 'users',
  audit: 'audit',
  health: 'health',
  settings: 'settings',
} as const;

type SectionKey = (typeof SECTIONS)[keyof typeof SECTIONS];

interface SectionPageProps {
  params: Promise<{ section: string }>;
}

function resolveSection(slug: string): SectionKey | null {
  return Object.hasOwn(SECTIONS, slug) ? SECTIONS[slug as keyof typeof SECTIONS] : null;
}

export async function generateMetadata({ params }: SectionPageProps): Promise<Metadata> {
  const key = resolveSection((await params).section);
  if (!key) {
    return {};
  }
  const t = await getTranslations('Nav');
  return { title: t(key) };
}

export default async function SectionPage({ params }: SectionPageProps) {
  const key = resolveSection((await params).section);
  if (!key) {
    notFound();
  }

  const t = await getTranslations();

  return (
    <>
      <PageHeader title={t(`Nav.${key}`)} />
      <EmptyState
        className="min-h-96"
        icon={<Construction />}
        title={t('Common.comingSoonTitle')}
        description={t('Common.comingSoonDescription')}
        action={
          <Button asChild variant="outline">
            <Link href="/">{t('Common.backToDashboard')}</Link>
          </Button>
        }
      />
    </>
  );
}
