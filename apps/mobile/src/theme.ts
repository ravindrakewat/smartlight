/**
 * Mobile design tokens — the same palette as the web design system
 * (packages/ui/src/styles/theme.css), tuned for outdoor use: high contrast,
 * large touch targets (≥ 48 dp) and generous text sizes.
 */
export const colors = {
  background: '#f5f7fa',
  surface: '#ffffff',
  surfaceSubtle: '#eef2f6',
  foreground: '#0f172a',
  muted: '#475569',
  border: '#dbe2ea',
  primary: '#1d4ed8',
  primaryPressed: '#1e40af',
  primarySubtle: '#e8efff',
  onPrimary: '#ffffff',
  brand: '#f59e0b',
  success: '#047857',
  successSubtle: '#e7f8f0',
  warning: '#a14a06',
  warningSubtle: '#fff4dc',
  danger: '#b91c1c',
  dangerSubtle: '#fdecec',
  info: '#1d4ed8',
  infoSubtle: '#e8efff',
  neutral: '#475569',
  neutralSubtle: '#eef2f6',
  // Deep navy for headers and the tab bar (same as the web console sidebar).
  navy: '#0b1a3d',
  navySoft: '#152a57',
  onNavy: '#eef3fb',
  onNavyMuted: '#b4c2db',
  navyAccent: '#7cb3ff',
  lamp: '#fde68a',
  lampCore: '#fbbf24',
} as const;

export type ToneName = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const tones: Record<ToneName, { fg: string; bg: string }> = {
  neutral: { fg: colors.neutral, bg: colors.neutralSubtle },
  info: { fg: colors.info, bg: colors.infoSubtle },
  success: { fg: colors.success, bg: colors.successSubtle },
  warning: { fg: colors.warning, bg: colors.warningSubtle },
  danger: { fg: colors.danger, bg: colors.dangerSubtle },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
export const MIN_TOUCH = 48;

/** Soft card shadow (iOS/web) with matching Android elevation. */
export const shadow = {
  shadowColor: '#0b1a3d',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
} as const;
