import { useId } from 'react';
import { cn } from '../lib/cn';

export type StreetPoleStatus = 'on' | 'dimmed' | 'off' | 'fault' | 'offline' | 'unknown';

export interface StreetPoleProps {
  status: StreetPoleStatus;
  /** Brightness 0–100 for lit lamps; scales the light cone. Defaults to 100 (60 when dimmed). */
  dimPercent?: number | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Animate the glow of lit lamps and the fault badge (always off with reduced motion). */
  animated?: boolean;
  className?: string;
}

const SIZES: Record<NonNullable<StreetPoleProps['size']>, string> = {
  xs: 'h-10',
  sm: 'h-16',
  md: 'h-24',
  lg: 'h-48',
};

/**
 * A street light drawn as it looks at night: lit lamps throw a warm cone of light
 * onto the road, faulty lamps carry a red "!" badge and offline controllers a
 * no-signal badge. Decorative: callers always provide the status as text as well
 * (WCAG 1.4.1), so the drawing is hidden from assistive technology.
 */
export function StreetPole({
  status,
  dimPercent,
  size = 'md',
  animated = true,
  className,
}: StreetPoleProps) {
  const id = useId().replace(/:/g, '');
  const lit = status === 'on' || status === 'dimmed';
  const level = Math.max(0, Math.min(100, dimPercent ?? (status === 'dimmed' ? 60 : 100)));
  const coneOpacity = lit ? 0.18 + 0.5 * (level / 100) : 0;
  const unknown = status === 'unknown';

  return (
    <svg
      viewBox="0 0 48 120"
      aria-hidden="true"
      focusable="false"
      className={cn('w-auto overflow-visible', SIZES[size], className)}
    >
      <defs>
        <linearGradient id={`cone-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="[stop-color:var(--color-lamp)]" stopOpacity="0.95" />
          <stop offset="100%" className="[stop-color:var(--color-lamp)]" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`halo-${id}`}>
          <stop offset="0%" className="[stop-color:var(--color-lamp)]" stopOpacity="0.9" />
          <stop offset="100%" className="[stop-color:var(--color-lamp)]" stopOpacity="0" />
        </radialGradient>
      </defs>

      {lit ? (
        <g className={cn(animated && 'motion-safe:animate-[sl-lamp-glow_4s_ease-in-out_infinite]')}>
          {/* Light falling on the road */}
          <polygon
            points="27,20 37,20 50,112 14,112"
            fill={`url(#cone-${id})`}
            opacity={coneOpacity}
          />
          <ellipse
            cx="32"
            cy="112"
            rx="18"
            ry="3.5"
            className="fill-lamp"
            opacity={coneOpacity * 0.8}
          />
          {/* Halo around the lamp */}
          <circle cx="32" cy="19" r={8 + 6 * (level / 100)} fill={`url(#halo-${id})`} />
        </g>
      ) : null}

      {/* Pole, base and arm */}
      <g
        className={cn(unknown ? 'fill-none stroke-pole' : 'fill-pole stroke-pole')}
        strokeDasharray={unknown ? '3 2' : undefined}
        opacity={unknown ? 0.7 : 1}
      >
        <rect x="11" y="16" width="3.5" height="94" rx="1" strokeWidth={unknown ? 1.2 : 0} />
        <rect x="7.5" y="108" width="10.5" height="5" rx="1.5" strokeWidth={unknown ? 1.2 : 0} />
        <path
          d="M12.75 22 Q13 13 22 13 L30 13"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>

      {/* Lamp head */}
      <rect
        x="24"
        y="12"
        width="16"
        height="6"
        rx="3"
        className={cn(
          status === 'fault'
            ? 'fill-night-danger'
            : lit
              ? 'fill-lamp-core'
              : unknown
                ? 'fill-none stroke-pole'
                : 'fill-lamp-off',
        )}
        strokeDasharray={unknown ? '3 2' : undefined}
        strokeWidth={unknown ? 1.2 : 0}
      />
      {lit ? <rect x="26" y="17" width="12" height="2.5" rx="1.25" className="fill-lamp" /> : null}

      {status === 'fault' ? (
        <g
          className={cn(
            animated && 'motion-safe:animate-[sl-fault-blink_1.6s_ease-in-out_infinite]',
          )}
        >
          <circle cx="40" cy="5" r="6.5" className="fill-night-danger" />
          <rect x="39" y="1" width="2" height="5" rx="1" className="fill-night" />
          <circle cx="40" cy="8.2" r="1.2" className="fill-night" />
        </g>
      ) : null}

      {status === 'offline' ? (
        <g>
          <circle cx="40" cy="5" r="6.5" className="fill-night-warning" />
          {/* Signal bars with a strike-through */}
          <rect x="35.8" y="6" width="1.8" height="2.5" rx="0.6" className="fill-night" />
          <rect x="39.1" y="4" width="1.8" height="4.5" rx="0.6" className="fill-night" />
          <rect x="42.4" y="2" width="1.8" height="6.5" rx="0.6" className="fill-night" />
          <path
            d="M35 1.5 L45 9.5"
            className="stroke-night"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
      ) : null}
    </svg>
  );
}
