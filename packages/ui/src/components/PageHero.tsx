import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface PageHeroProps {
  /** Page title, rendered as the page's only `h1`. */
  title: string;
  /** Optional last part of the title drawn in the accent colour, e.g. "Map" in "Live Map". */
  accent?: string;
  description?: ReactNode;
  /** Icon in a glowing circle before the title. */
  icon?: ReactNode;
  /** Right side, e.g. a live clock or actions. */
  aside?: ReactNode;
  className?: string;
}

/** Poles along the right footpath, shrinking towards the horizon (x, base y, height). */
const POLES = [
  [770, 160, 84],
  [702, 149, 66],
  [648, 140, 52],
  [608, 133, 41],
  [578, 128, 32],
  [556, 124, 25],
  [540, 121, 19],
] as const;

/** Night street drawn in SVG: road to the horizon, lit poles and trees. Decorative. */
function NightStreet() {
  return (
    <svg
      viewBox="0 0 800 160"
      preserveAspectRatio="xMaxYMax slice"
      aria-hidden="true"
      focusable="false"
      className="absolute inset-0 h-full w-full"
    >
      <defs>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="[stop-color:var(--color-night)]" />
          <stop offset="100%" className="[stop-color:var(--color-night-soft)]" />
        </linearGradient>
        <radialGradient id="hero-glow">
          <stop offset="0%" className="[stop-color:var(--color-lamp)]" stopOpacity="0.95" />
          <stop offset="100%" className="[stop-color:var(--color-lamp)]" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hero-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="[stop-color:var(--color-lamp)]" stopOpacity="0.55" />
          <stop offset="100%" className="[stop-color:var(--color-lamp)]" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hero-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" className="[stop-color:var(--color-night)]" stopOpacity="1" />
          <stop offset="55%" className="[stop-color:var(--color-night)]" stopOpacity="0.15" />
          <stop offset="100%" className="[stop-color:var(--color-night)]" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="800" height="160" fill="url(#hero-sky)" />

      {/* Stars */}
      <g className="fill-night-foreground" opacity="0.5">
        <circle cx="430" cy="18" r="0.9" />
        <circle cx="520" cy="10" r="0.7" />
        <circle cx="610" cy="24" r="0.8" />
        <circle cx="690" cy="12" r="0.6" />
        <circle cx="745" cy="30" r="0.9" />
        <circle cx="470" cy="40" r="0.6" />
      </g>

      {/* Distant city */}
      <path
        className="fill-road"
        d="M380 118v-14h10v-10h8v10h6v-18h10v18h8v-8h12v8h6v-24h8v24h10v-12h10v12h8v-6h14v6h8v-16h10v16h12v20z"
      />

      {/* Trees on the left verge */}
      <g className="fill-night-soft">
        <circle cx="470" cy="104" r="16" />
        <circle cx="492" cy="108" r="12" />
        <circle cx="446" cy="110" r="10" />
      </g>

      {/* Road towards the horizon with a dashed centre line */}
      <polygon points="520,118 548,118 800,160 300,160" className="fill-road" />
      <path
        d="M534 120 L 560 160"
        className="stroke-lamp"
        strokeWidth="2"
        strokeDasharray="10 9"
        opacity="0.45"
      />

      {/* Poles with light cones and pools on the road */}
      <g className="motion-safe:animate-[sl-hero-pulse_5s_ease-in-out_infinite]">
        {POLES.map(([x, base, height]) => {
          const top = base - height;
          const arm = height * 0.18;
          const lampX = x - arm;
          return (
            <g key={x}>
              <polygon
                points={`${lampX - 2},${top + 3} ${lampX + 2},${top + 3} ${lampX + height * 0.32},${base} ${lampX - height * 0.32},${base}`}
                fill="url(#hero-cone)"
              />
              <ellipse
                cx={lampX}
                cy={base - 1}
                rx={height * 0.34}
                ry={height * 0.05}
                className="fill-lamp"
                opacity="0.28"
              />
              <circle cx={lampX} cy={top + 2} r={height * 0.16} fill="url(#hero-glow)" />
            </g>
          );
        })}
      </g>
      <g className="stroke-pole" strokeLinecap="round" fill="none">
        {POLES.map(([x, base, height]) => {
          const top = base - height;
          const arm = height * 0.18;
          return (
            <g key={x} strokeWidth={Math.max(1, height / 40)}>
              <path d={`M${x} ${base} V${top}`} />
              <path d={`M${x} ${top} Q${x} ${top - 3} ${x - arm} ${top}`} />
            </g>
          );
        })}
      </g>
      <g className="fill-lamp-core">
        {POLES.map(([x, base, height]) => (
          <rect
            key={x}
            x={x - height * 0.18 - height * 0.06}
            y={base - height - 1}
            width={height * 0.12}
            height={Math.max(1.5, height * 0.035)}
            rx="1"
          />
        ))}
      </g>

      {/* Trees on the right verge, in front of the poles */}
      <g className="fill-night">
        <circle cx="792" cy="96" r="26" />
        <circle cx="768" cy="110" r="18" />
      </g>

      {/* Fade into the text side */}
      <rect width="800" height="160" fill="url(#hero-fade)" />
    </svg>
  );
}

/**
 * Page banner: a street at night behind the page title. Carries the page's `h1`,
 * so use it instead of `PageHeader`, never both.
 */
export function PageHero({ title, accent, description, icon, aside, className }: PageHeroProps) {
  return (
    <section
      className={cn(
        'relative isolate mb-6 overflow-hidden rounded-2xl bg-night text-night-foreground shadow-lg shadow-night/20',
        className,
      )}
    >
      <NightStreet />
      <div className="relative flex min-h-36 flex-wrap items-center gap-x-6 gap-y-4 px-5 py-6 sm:px-8">
        {icon ? (
          <span
            aria-hidden="true"
            className="hidden size-16 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_32px] shadow-primary/60 sm:grid [&_svg]:size-7"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-[14rem] flex-1">
          <h1 className="text-2xl font-bold sm:text-3xl">
            {title}
            {accent ? <span className="text-night-accent"> {accent}</span> : null}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-night-foreground/90 sm:text-base">
              {description}
            </p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </section>
  );
}
