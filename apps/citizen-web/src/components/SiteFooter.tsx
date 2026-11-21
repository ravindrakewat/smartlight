import { getTranslations } from 'next-intl/server';

export async function SiteFooter() {
  const t = await getTranslations('Footer');

  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <p>{t('note')}</p>
        <p>{t('rights', { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
