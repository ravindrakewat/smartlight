import { uiTokens } from '../styles/theme';

export interface KeyValueItem {
  label: string;
  value: string;
  mono?: boolean;
}

export interface KeyValueListProps {
  items: KeyValueItem[];
}

export function KeyValueList({ items }: KeyValueListProps) {
  return (
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '12px 20px',
        margin: 0,
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            backgroundColor: uiTokens.colors.surfaceSubtle,
            borderRadius: uiTokens.radii.md,
            padding: '12px 14px',
          }}
        >
          <dt
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: uiTokens.colors.textMuted,
              marginBottom: '4px',
            }}
          >
            {item.label}
          </dt>
          <dd
            style={{
              margin: 0,
              fontSize: '0.9rem',
              fontWeight: 500,
              color: uiTokens.colors.textPrimary,
              fontFamily: item.mono ? uiTokens.fonts.mono : uiTokens.fonts.sans,
              wordBreak: 'break-word',
            }}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
