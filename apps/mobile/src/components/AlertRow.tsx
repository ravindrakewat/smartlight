import type { DeviceEventDto } from '@smart-light/shared';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n, useRelativeTime } from '../i18n';
import { faultLabel } from '../lib/labels';
import { colors, spacing, type ToneName } from '../theme';
import { IconCircle, type IconName } from './kit';
import { Badge } from './ui';

const SEVERITY: Record<DeviceEventDto['severity'], { icon: IconName; tone: ToneName }> = {
  critical: { icon: 'warning', tone: 'danger' },
  warning: { icon: 'alert-circle', tone: 'warning' },
  info: { icon: 'information-circle', tone: 'info' },
};

/** One controller alert: what, which pole, how long ago and how serious. */
export function AlertRow({ alert }: { alert: DeviceEventDto }) {
  const { messages: m } = useI18n();
  const relative = useRelativeTime();
  const fixed = alert.resolvedAt !== null;
  const severity = fixed
    ? { icon: 'checkmark-circle' as const, tone: 'success' as const }
    : SEVERITY[alert.severity];

  return (
    <View style={styles.row} accessible>
      <IconCircle name={severity.icon} tone={severity.tone} size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title}>{faultLabel(m, alert.type)}</Text>
        <Text style={styles.place} numberOfLines={2}>
          {[alert.pole?.code ?? alert.deviceId, alert.pole?.address].filter(Boolean).join(' · ')}
        </Text>
        {alert.message ? (
          <Text style={styles.message} numberOfLines={2}>
            {alert.message}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={styles.time}>{relative(alert.receivedAt)}</Text>
        <Badge
          label={fixed ? m.alerts.fixed : m.alerts.severity[alert.severity]}
          tone={severity.tone}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.foreground },
  place: { fontSize: 14, color: colors.muted },
  message: { fontSize: 13, color: colors.muted },
  time: { fontSize: 13, color: colors.muted },
});
