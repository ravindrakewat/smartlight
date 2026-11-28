import type { SVGProps } from 'react';

export type StreetLightIconProps = SVGProps<SVGSVGElement>;

/**
 * Street-light pole with its lamp head, drawn like a Lucide icon (24 px grid,
 * 2 px round strokes, `currentColor`) so it can stand in for one anywhere.
 * Decorative by default; pass `aria-hidden={false}` and a title if it carries meaning.
 */
export function StreetLightIcon({ className, ...props }: StreetLightIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {/* pole and arm */}
      <path d="M7 21V6.5A3.5 3.5 0 0 1 10.5 3H15" />
      {/* lamp head */}
      <path d="M12.5 5.5h6a1 1 0 0 1 .9 1.45L18.5 8.5h-5l-.9-1.55a1 1 0 0 1-.1-1.45Z" />
      {/* light falling from the lamp */}
      <path d="M13.5 11.5 12.5 14M16 11.5v3M18.5 11.5l1 2.5" />
      {/* base */}
      <path d="M4.5 21h5" />
    </svg>
  );
}
