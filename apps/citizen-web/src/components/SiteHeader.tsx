import { BrandMark, Button, TextSizeControl } from '@smart-light/ui';
import { Megaphone } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from './LocaleSwitcher';

export async function SiteHeader() {
  const t = await getTranslations('Common');

  return (
    <header className="border-b border-border bg-surface">
      {/* Accessibility utility bar (GIGW 3.0): text size + language. */}
      <div className="border-b border-border bg-surface-subtle">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-x-4 gap-y-1 px-4 py-1.5 sm:px-6">
          <TextSizeControl
            labels={{
              group: t('textSize.group'),
              decrease: t('textSize.decrease'),
              reset: t('textSize.reset'),
              increase: t('textSize.increase'),
            }}
          />
          <LocaleSwitcher />
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-3 rounded-lg">
          <BrandMark className="size-11" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-lg font-semibold">{t('appName')}</span>
            <span className="block truncate text-sm text-muted-foreground">{t('tagline')}</span>
          </span>
        </Link>
        <Button asChild className="hidden sm:inline-flex">
          <Link href="/report">
            <Megaphone />
            {t('reportCta')}
          </Link>
        </Button>
      </div>
    </header>
  );
}
