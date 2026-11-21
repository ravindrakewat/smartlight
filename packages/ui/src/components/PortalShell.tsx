import type { ReactNode } from 'react';
import { uiTokens } from '../styles/theme';
import { StatusBadge, type StatusBadgeTone } from './StatusBadge';

export interface PortalShellProps {
  portalName: string;
  badgeLabel: string;
  badgeTone?: StatusBadgeTone;
  description: string;
  children: ReactNode;
}

export function PortalShell({
  portalName,
  badgeLabel,
  badgeTone = 'info',
  description,
  children,
}: PortalShellProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: uiTokens.colors.canvas,
        color: uiTokens.colors.textPrimary,
        fontFamily: uiTokens.fonts.sans,
      }}
    >
      <header
        style={{
          backgroundColor: uiTokens.colors.surface,
          borderBottom: `1px solid ${uiTokens.colors.border}`,
          padding: '16px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1040px',
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: uiTokens.colors.textMuted,
              }}
            >
              Smart Street Light Management System
            </div>
            <h1 style={{ margin: '2px 0 0', fontSize: '1.35rem', fontWeight: 700 }}>
              {portalName}
            </h1>
          </div>
          <StatusBadge tone={badgeTone}>{badgeLabel}</StatusBadge>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          width: '100%',
          maxWidth: '1040px',
          margin: '0 auto',
          padding: '28px 24px 48px',
          boxSizing: 'border-box',
        }}
      >
        <p
          style={{
            margin: '0 0 24px',
            fontSize: '0.975rem',
            lineHeight: 1.6,
            color: uiTokens.colors.textSecondary,
            maxWidth: '72ch',
          }}
        >
          {description}
        </p>
        <div style={{ display: 'grid', gap: '20px' }}>{children}</div>
      </main>

      <footer
        style={{
          borderTop: `1px solid ${uiTokens.colors.border}`,
          padding: '16px 24px',
          fontSize: '0.8rem',
          color: uiTokens.colors.textMuted,
          textAlign: 'center',
        }}
      >
        Phase 0 Monorepo Foundation — All business logic is served exclusively by @smart-light/api.
      </footer>
    </div>
  );
}
