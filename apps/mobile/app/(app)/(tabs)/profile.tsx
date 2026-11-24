import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { confirmAction, Icon, ListRow } from '../../../src/components/kit';
import { useI18n } from '../../../src/i18n';
import { useJobHistory, useMyJobs } from '../../../src/lib/queries';
import { useSession } from '../../../src/lib/session';
import { colors, radius, shadow, spacing } from '../../../src/theme';

function initials(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function ProfileScreen() {
  const { messages: m, locale, toggleLocale } = useI18n();
  const { user, signOut } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const open = useMyJobs();
  const history = useJobHistory();

  const stats = [
    { icon: 'clipboard' as const, value: open.data?.items.length, label: m.profile.openJobs },
    {
      icon: 'checkmark-done' as const,
      value: history.data?.filter((job) => job.status === 'RESOLVED').length,
      label: m.profile.fixed,
    },
    {
      icon: 'hourglass' as const,
      value: history.data?.filter((job) => job.status === 'PENDING_VERIFICATION').length,
      label: m.profile.waiting,
    },
  ];

  async function logout() {
    const ok = await confirmAction({
      title: m.common.signOut,
      message: m.profile.signOutConfirm,
      confirm: m.common.signOut,
      cancel: m.job.cancel,
      destructive: true,
    });
    if (ok) {
      await signOut();
    }
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Text accessibilityRole="header" style={styles.screenTitle}>
          {m.profile.title}
        </Text>
        {user ? (
          <View style={styles.person}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(user.name)}</Text>
              <View style={styles.onlineDot} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name}>{user.name}</Text>
              <Text style={styles.role}>
                {m.roles[user.role]}
                {user.agency ? ` · ${user.agency.name}` : ''}
              </Text>
              <Text style={styles.email} numberOfLines={1}>
                {user.email}
              </Text>
              {user.tenant ? (
                <Text style={styles.email} numberOfLines={1}>
                  {locale === 'hi' ? user.tenant.nameHi : user.tenant.name}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.stats}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.stat} accessible>
            <Icon name={stat.icon} size={22} color={colors.primary} />
            <Text style={styles.statValue}>{stat.value ?? '—'}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.group}>
        <ListRow
          icon="time-outline"
          label={m.history.title}
          onPress={() => router.push('/history')}
        />
        <View style={styles.divider} />
        <ListRow
          icon="lock-closed-outline"
          label={m.profile.changePassword}
          onPress={() => router.push('/password')}
        />
        <View style={styles.divider} />
        <ListRow
          icon="language-outline"
          label={m.profile.language}
          right={
            <View style={styles.segment} accessibilityRole="radiogroup">
              {(['hi', 'en'] as const).map((code) => {
                const selected = locale === code;
                return (
                  <Pressable
                    key={code}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      if (!selected) toggleLocale();
                    }}
                    style={[styles.segmentItem, selected && styles.segmentSelected]}
                  >
                    <Text style={[styles.segmentText, selected && { color: colors.onPrimary }]}>
                      {code === 'hi' ? 'हिन्दी' : 'English'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          }
        />
      </View>

      <View style={styles.group}>
        <ListRow
          icon="information-circle-outline"
          label={m.profile.about}
          value={`v${Constants.expoConfig?.version ?? '—'}`}
        />
        <View style={styles.divider} />
        <ListRow
          icon="log-out-outline"
          label={m.common.signOut}
          danger
          onPress={() => void logout()}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingBottom: 64,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    gap: spacing.lg,
  },
  screenTitle: { fontSize: 22, fontWeight: '800', color: colors.onNavy },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.navyAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 30, fontWeight: '900', color: colors.onPrimary },
  onlineDot: {
    position: 'absolute',
    right: 2,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#22c55e',
    borderWidth: 3,
    borderColor: colors.navy,
  },
  name: { fontSize: 22, fontWeight: '800', color: colors.onNavy },
  role: { fontSize: 15, color: colors.navyAccent, fontWeight: '700' },
  email: { fontSize: 14, color: colors.onNavyMuted },
  stats: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: -44,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    ...shadow,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 24, fontWeight: '900', color: colors.foreground },
  statLabel: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  group: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 52 },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.pill,
    padding: 3,
  },
  segmentItem: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  segmentSelected: { backgroundColor: colors.primary },
  segmentText: { fontSize: 15, fontWeight: '700', color: colors.foreground },
});
