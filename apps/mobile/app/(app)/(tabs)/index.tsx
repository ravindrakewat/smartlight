import type { HealthCheckData } from '@smart-light/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AlertRow } from '../../../src/components/AlertRow';
import { JobCard } from '../../../src/components/JobCard';
import {
  HeaderButton,
  Icon,
  IconCircle,
  NightStreet,
  SectionHeader,
  StatTile,
  type IconName,
} from '../../../src/components/kit';
import { Message } from '../../../src/components/ui';
import { useI18n } from '../../../src/i18n';
import { api } from '../../../src/lib/api';
import {
  useAlerts,
  useMyJobs,
  useOpenAlertCount,
  useUnreadNotifications,
} from '../../../src/lib/queries';
import { useSession } from '../../../src/lib/session';
import { colors, radius, shadow, spacing, type ToneName } from '../../../src/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const { messages: m, locale } = useI18n();
  const { user } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const jobs = useMyJobs();
  const alerts = useAlerts();
  const alertCount = useOpenAlertCount();
  const unreadNotifications = useUnreadNotifications();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.request<HealthCheckData>('/health/ready'),
    refetchInterval: 60_000,
    retry: false,
  });

  const items = jobs.data?.items ?? [];
  const count = (predicate: (job: (typeof items)[number]) => boolean) =>
    items.filter(predicate).length;
  const tiles: {
    filter: string;
    icon: IconName;
    tone: ToneName;
    label: string;
    value: number;
  }[] = [
    {
      filter: 'todo',
      icon: 'clipboard',
      tone: 'info',
      label: m.home.assigned,
      value: count((job) => job.status === 'ASSIGNED' || job.status === 'OPEN'),
    },
    {
      filter: 'progress',
      icon: 'construct',
      tone: 'info',
      label: m.home.inProgress,
      value: count((job) => job.status === 'IN_PROGRESS'),
    },
    {
      filter: 'verification',
      icon: 'hourglass',
      tone: 'warning',
      label: m.home.verification,
      value: count((job) => job.status === 'PENDING_VERIFICATION'),
    },
    {
      filter: 'overdue',
      icon: 'alert-circle',
      tone: 'danger',
      label: m.home.overdue,
      value: count((job) => job.overdue),
    },
  ];
  const next = [...items]
    .filter((job) => job.status !== 'PENDING_VERIFICATION')
    .sort((a, b) => new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime())[0];
  const city = user?.tenant ? (locale === 'hi' ? user.tenant.nameHi : user.tenant.name) : '';
  const online = health.isSuccess;
  const actions: { icon: IconName; label: string; tone: ToneName; onPress: () => void }[] = [
    { icon: 'qr-code', label: m.nav.scan, tone: 'info', onPress: () => router.push('/scan') },
    { icon: 'clipboard', label: m.nav.work, tone: 'info', onPress: () => router.push('/work') },
    {
      icon: 'notifications',
      label: m.nav.alerts,
      tone: 'danger',
      onPress: () => router.push('/alerts'),
    },
    {
      icon: 'time',
      label: m.history.title,
      tone: 'success',
      onPress: () => router.push('/history'),
    },
  ];

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      refreshControl={
        <RefreshControl
          refreshing={jobs.isRefetching}
          onRefresh={() => {
            void jobs.refetch();
            void alerts.refetch();
          }}
        />
      }
    >
      {/* Navy header with the city hero */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerRow}>
          <View style={styles.logo}>
            <Icon name="bulb" size={24} color={colors.lampCore} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.appName}>{m.appName}</Text>
            <Text style={styles.hello} numberOfLines={1}>
              {user ? `${m.home.hello}, ${user.name}` : ''}
            </Text>
          </View>
          <HeaderButton
            icon="mail-outline"
            label={m.notifications.title}
            badge={unreadNotifications.data?.unread || undefined}
            onPress={() => router.push('/notifications')}
          />
          <HeaderButton
            icon="notifications-outline"
            label={m.nav.alerts}
            badge={alertCount ?? undefined}
            onPress={() => router.push('/alerts')}
          />
        </View>

        <View style={styles.hero}>
          <NightStreet height={150} />
          <View style={styles.heroText}>
            <Text style={styles.city} accessibilityRole="header">
              {city || m.appName}
            </Text>
            <Text style={styles.tagline}>{m.home.tagline}</Text>
          </View>
          <View style={[styles.statusPill, !online && { backgroundColor: colors.danger }]}>
            <View
              style={[styles.statusDot, { backgroundColor: online ? '#4ade80' : colors.onPrimary }]}
            />
            <Text style={styles.statusText}>
              {health.isPending ? m.common.loading : online ? m.home.online : m.home.offline}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        {jobs.error ? <Message text={m.common.error} /> : null}

        <View style={styles.grid}>
          {tiles.map((tile) => (
            <StatTile
              key={tile.filter}
              icon={tile.icon}
              tone={tile.tone}
              label={tile.label}
              value={jobs.data ? String(tile.value) : '—'}
              onPress={() => router.push({ pathname: '/work', params: { filter: tile.filter } })}
              style={styles.gridItem}
            />
          ))}
        </View>

        <View style={styles.panel}>
          <SectionHeader title={m.home.quick} />
          <View style={styles.actions}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                onPress={action.onPress}
                style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
              >
                <IconCircle name={action.icon} tone={action.tone} size={56} />
                <Text style={styles.actionLabel} numberOfLines={2}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <SectionHeader
          title={m.home.next}
          action={{ label: m.home.viewAll, onPress: () => router.push('/work') }}
        />
        {next ? (
          <JobCard
            job={next}
            onPress={() => router.push({ pathname: '/job/[id]', params: { id: next.id } })}
          />
        ) : jobs.data ? (
          <Message tone="success" text={m.jobs.empty} />
        ) : (
          <Text style={{ color: colors.muted }}>{m.common.loading}</Text>
        )}

        <SectionHeader
          title={m.home.recentAlerts}
          action={{ label: m.home.viewAll, onPress: () => router.push('/alerts') }}
        />
        <View style={styles.panel}>
          {alerts.data?.items.length ? (
            alerts.data.items.slice(0, 3).map((alert) => <AlertRow key={alert.id} alert={alert} />)
          ) : (
            <Text style={{ color: colors.muted, padding: spacing.sm }}>
              {alerts.isPending ? m.common.loading : m.alerts.empty}
            </Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingBottom: 56,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    gap: spacing.lg,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.navySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: { fontSize: 20, fontWeight: '800', color: colors.onNavy },
  hello: { fontSize: 14, color: colors.onNavyMuted },
  hero: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.navySoft },
  heroText: { position: 'absolute', left: spacing.lg, top: spacing.md, right: spacing.lg },
  city: { fontSize: 30, fontWeight: '900', color: colors.onNavy },
  tagline: { fontSize: 14, color: colors.onNavyMuted },
  statusPill: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: '#065f46',
  },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { color: colors.onPrimary, fontSize: 13, fontWeight: '800' },
  body: { paddingHorizontal: spacing.lg, marginTop: -40, gap: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridItem: { flexBasis: '46%' },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow,
  },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  action: { flex: 1, alignItems: 'center', gap: spacing.xs, minHeight: 88 },
  actionLabel: { fontSize: 13, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
});
