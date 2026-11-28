import Image from 'next/image';
import { getTranslations } from 'next-intl/server';

/** "Made in India" card at the foot of the sidebar, over the night-city photo. */
export async function SidebarBrand() {
  const t = await getTranslations('Shell');
  return (
    <div className="relative isolate overflow-hidden rounded-xl border border-sidebar-soft">
      <Image
        src="/images/hero-night-city.webp"
        alt=""
        fill
        sizes="240px"
        className="-z-10 object-cover object-[75%_center]"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-sidebar/75" />
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Tricolour as three bars (decorative; the text says "Made in India"). */}
        <span aria-hidden="true" className="grid h-6 w-9 shrink-0 overflow-hidden rounded-sm">
          <span className="bg-flag-saffron" />
          <span className="grid place-items-center bg-flag-white">
            <span className="size-1.5 rounded-full border border-flag-navy" />
          </span>
          <span className="bg-flag-green" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-sidebar-foreground">
            {t('madeInIndia')}
          </span>
          <span className="block text-xs leading-snug text-sidebar-muted">{t('tagline')}</span>
        </span>
      </div>
    </div>
  );
}
