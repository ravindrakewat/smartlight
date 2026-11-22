import { SkipLink } from '@smart-light/ui';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { SessionGuard } from '@/components/Session';

/** Print views: signed-in only, without the console's sidebar and header. */
export default async function PrintLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('Common');
  return (
    <>
      <SkipLink label={t('skipToContent')} />
      <main
        id="main-content"
        className="mx-auto max-w-[210mm] px-4 py-6 print:max-w-none print:p-0"
      >
        <SessionGuard>{children}</SessionGuard>
      </main>
    </>
  );
}
