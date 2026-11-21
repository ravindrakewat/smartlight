import type { ReactNode } from 'react';
import { uiTokens } from '../styles/theme';

export interface SurfaceCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function SurfaceCard({ title, subtitle, children }: SurfaceCardProps) {
  return (
    <section
      style={{
        backgroundColor: uiTokens.colors.surface,
        border: `1px solid ${uiTokens.colors.border}`,
        borderRadius: uiTokens.radii.lg,
        padding: '20px 24px',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
      }}
    >
      <header style={{ marginBottom: '12px' }}>
        <h2
          style={{
            margin: 0,
            fontSize: '1.05rem',
            fontWeight: 600,
            color: uiTokens.colors.textPrimary,
          }}
        >
          {title}
        </h2>
        {subtitle ? (
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '0.875rem',
              color: uiTokens.colors.textSecondary,
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </header>
      <div>{children}</div>
    </section>
  );
}
