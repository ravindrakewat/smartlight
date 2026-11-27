import Image from 'next/image';

/** Night-city street photo behind every page banner (decorative; PageHero adds the navy wash). */
export function HeroBackground() {
  return (
    <Image
      src="/images/hero-night-city.webp"
      alt=""
      fill
      priority
      sizes="(min-width: 1280px) 1100px, 100vw"
      className="object-cover object-center"
    />
  );
}
