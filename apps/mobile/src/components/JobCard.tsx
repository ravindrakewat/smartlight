import type { WorkOrderSummaryDto } from '@smart-light/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n, useRelativeTime } from '../i18n';
import { faultLabel, PRIORITY_TONES, STATUS_TONES } from '../lib/labels';
import { colors, radius, shadow, spacing, tones, type ToneName } from '../theme';
import { Icon, IconCircle, type IconName } from './kit';
import { Badge } from './ui';

/** What the technician can do next with this job. */
export function nextAction(status: WorkOrderSummaryDto['status']): 'start' | 'continue' | 'view' {
  if (status === 'ASSIGNED' || status === 'OPEN') return 'start';
  if (status === 'IN_PROGRESS') return 'continue';
  return 'view';
}

function iconFor(job: WorkOrderSummaryDto): { name: IconName; tone: ToneName } {
  if (job.status === 'RESOLVED') return { name: 'checkmark-circle', tone: 'success' };
  if (job.status === 'PENDING_VERIFICATION') return { name: 'hourglass', tone: 'warning' };
  if (job.status === 'IN_PROGRESS') return { name: 'construct', tone: 'info' };
  if (job.faultType === 'offline') return { name: 'cloud-offline', tone: 'warning' };
  return { name: 'bulb', tone: job.overdue ? 'danger' : PRIORITY_TONES[job.priority] };
}

/** One work order in a list: what, where, how urgent, and the next step. */
export function JobCard({ job, onPress }: { job: WorkOrderSummaryDto; onPress: () => void }) {
  const { messages: m, format } = useI18n();
  const relative = useRelativeTime();
  const icon = iconFor(job);
  const action = nextAction(job.status);
  const actionLabel =
    action === 'start' ? m.work.start : action === 'continue' ? m.work.continue : m.work.view;
  const accent = job.overdue
    ? colors.danger
    : job.status === 'RESOLVED'
      ? colors.success
      : tones[PRIORITY_TONES[job.priority]].fg;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={actionLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: accent },
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={styles.top}>
        <IconCircle name={icon.name} tone={icon.tone} size={48} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.badges}>
            <Badge label={m.priority[job.priority]} tone={PRIORITY_TONES[job.priority]} />
            <Badge label={m.status[job.status]} tone={STATUS_TONES[job.status]} />
          </View>
          <Text style={styles.fault}>{faultLabel(m, job.faultType)}</Text>
          <Text style={styles.number}>
            {job.number} · <Text style={styles.code}>{job.pole.code}</Text>
          </Text>
        </View>
      </View>

      {job.pole.address || job.pole.zoneName ? (
        <View style={styles.line}>
          <Icon name="location-outline" size={18} color={colors.muted} />
          <Text style={styles.lineText} numberOfLines={2}>
            {[job.pole.address, job.pole.zoneName].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ) : null}

      <View style={styles.bottom}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.line}>
            <Icon name="calendar-outline" size={16} color={colors.muted} />
            <Text style={styles.small}>
              {format(m.work.assigned, { time: relative(job.createdAt) })}
            </Text>
          </View>
          {job.status !== 'RESOLVED' && job.status !== 'CANCELLED' ? (
            <View style={styles.line}>
              <Icon
                name={job.overdue ? 'alert-circle' : 'time-outline'}
                size={16}
                color={job.overdue ? colors.danger : colors.muted}
              />
              <Text
                style={[styles.small, job.overdue && { color: colors.danger, fontWeight: '800' }]}
              >
                {job.overdue
                  ? `${m.jobs.overdue} · ${relative(job.slaDueAt)}`
                  : format(m.jobs.due, { time: relative(job.slaDueAt) })}
              </Text>
            </View>
          ) : null}
        </View>
        <View
          style={[
            styles.action,
            action === 'view'
              ? { backgroundColor: colors.primarySubtle }
              : { backgroundColor: colors.primary },
          ]}
        >
          <Text
            style={[
              styles.actionText,
              { color: action === 'view' ? colors.primary : colors.onPrimary },
            ]}
          >
            {actionLabel}
          </Text>
          <Icon
            name="arrow-forward"
            size={16}
            color={action === 'view' ? colors.primary : colors.onPrimary}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 5,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow,
  },
  top: { flexDirection: 'row', gap: spacing.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  fault: { fontSize: 19, fontWeight: '800', color: colors.foreground },
  number: { fontSize: 14, color: colors.muted },
  code: { fontFamily: 'monospace', color: colors.foreground, fontWeight: '700' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineText: { flex: 1, fontSize: 15, color: colors.muted },
  small: { fontSize: 14, color: colors.muted },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  action: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  actionText: { fontSize: 15, fontWeight: '800' },
});
