import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/**
 * Crisp, print-safe QR code drawn as one SVG path (no images, no innerHTML).
 * Error correction "Q" survives dust, scratches and weathering on street plates.
 */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  /** Accessible name, e.g. "QR code for pole IND-000001-8". */
  label: string;
  className?: string;
}) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'Q');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          d += `M${col + 4} ${row + 4}h1v1h-1z`;
        }
      }
    }
    // 4-module quiet zone on every side, as the QR standard requires.
    return { size: count + 8, path: d };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={size} height={size} className="fill-surface" />
      <path d={path} className="fill-foreground" />
    </svg>
  );
}
