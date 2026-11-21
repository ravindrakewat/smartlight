import { Button, Card } from '@smart-light/ui';
import {
  Cable,
  LightbulbOff,
  MapPin,
  MessageSquareText,
  Search,
  ShieldAlert,
  Sun,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { resolvePageLocale, type LocaleParams } from '@/i18n/page-locale';

export default async function HomePage(props: LocaleParams) {
  await resolvePageLocale(props);

  const t = await getTranslations('Home');
  const tCommon = await getTranslations('Common');

  const issues: { icon: LucideIcon; label: string }[] = [
    { icon: LightbulbOff, label: t('issues.lightOff') },
    { icon: Zap, label: t('issues.flickering') },
    { icon: Sun, label: t('issues.dayBurning') },
    { icon: Cable, label: t('issues.damage') },
  ];

  const steps: { icon: LucideIcon; title: string; body: string }[] = [
    { icon: MapPin, title: t('steps.one.title'), body: t('steps.one.body') },
    { icon: MessageSquareText, title: t('steps.two.title'), body: t('steps.two.body') },
    { icon: Search, title: t('steps.three.title'), body: t('steps.three.body') },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-surface">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 right-[-10%] size-[32rem] rounded-full bg-brand/15 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.25fr_1fr] lg:items-center lg:py-20">
          <div>
            <p className="text-sm font-semibold text-primary">{t('eyebrow')}</p>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl lg:text-5xl">{t('title')}</h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">{t('subtitle')}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/report">{tCommon('reportCta')}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/track">{tCommon('trackCta')}</Link>
              </Button>
            </div>
          </div>

          <Card className="p-6">
            <h2 className="text-base font-semibold">{t('issues.title')}</h2>
            <ul className="mt-4 grid gap-3">
              {issues.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="flex items-center gap-3 rounded-xl bg-surface-subtle px-4 py-3 font-medium"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-primary shadow-xs"
                  >
                    <Icon className="size-5" />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-it-works" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 id="how-it-works" className="text-2xl font-semibold sm:text-3xl">
          {t('steps.title')}
        </h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-primary text-lg font-bold text-primary-foreground tabular-nums">
                  {index + 1}
                </span>
                <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-1.5 text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Safety */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div
          role="note"
          className="flex items-start gap-4 rounded-2xl border border-danger/30 bg-danger-subtle p-5 sm:p-6"
        >
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-danger" />
          <div>
            <h2 className="font-semibold text-danger">{t('safety.title')}</h2>
            <p className="mt-1">{t('safety.body')}</p>
          </div>
        </div>
      </section>
    </>
  );
}
