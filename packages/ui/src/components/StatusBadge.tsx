import type { ReactNode } from 'react';
import { uiTokens } from '../styles/theme';

export type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning';

export interface StatusBadgeProps {
  children: ReactNode;
  tone?: StatusBadgeTone;
}

const TONE_STYLES: Record<StatusBadgeTone, { color: string; backgroundColor: string }> = {
  neutral: {
    color: uiTokens.colors.accentSlate,
    backgroundColor: uiTokens.colors.accentSlateBg,
  },
  info: {
    color: uiTokens.colors.accentBlue,
    backgroundColor: uiTokens.colors.accentBlueBg,
  },
  success: {
    color: uiTokens.colors.accentEmerald,
    backgroundColor: uiTokens.colors.accentEmeraldBg,
  },
  warning: {
    color: uiTokens.colors.accentAmber,
    backgroundColor: uiTokens.colors.accentAmberBg,
  },
};

export function StatusBadge({ children, tone = 'neutral' }: StatusBadgeProps) {
  const style = TONE_STYLES[tone];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: uiTokens.radii.pill,
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.02em',
        lineHeight: 1.2,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
