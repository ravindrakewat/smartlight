import type { NotificationDto } from '@smart-light/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { EmptyState, IconCircle, type IconName } from '../../src/components/kit';
import { Message } from '../../src/components/ui';
import { useI18n, useRelativeTime } from '../../src/i18n';
import { api } from '../../src/lib/api';
import { colors, MIN_TOUCH, radius, spacing, type ToneName } from '../../src/theme';

const LOOK: Record<string, { icon: IconName; tone: ToneName }> = {
  'work_order.assigned': { icon: 'clipboard', tone: 'info' },
  'work_order.fix_rejected': { icon: 'close-circle', tone: 'danger' },
  'work_order.verified': { icon: 'shield-checkmark', tone: 'success' },
  'work_order.awaiting_verification': { icon: 'hourglass', tone: 'warning' },
  'work_order.sla_breached': { icon: 'alarm', tone: 'danger' },
};

/** The signed-in person's notifications; tapping one opens the job. */
export default function NotificationsScreen() {
  const { messages: m, format } = useI18n();
  const relative = useRelativeTime();
  const router = useRouter();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api.page<NotificationDto>('/v1/notifications', { query: { pageSize: 50 } }),
  });
  const markRead = useMutation({
    mutationFn: (body: { ids: string[] } | { all: true }) =>
      api.request<{ unread: number }>('/v1/notifications/read', { method: 'POST', body }),
    onSuccess: (data) => {
      queryClient.setQueryData(['notifications', 'unread'], data);
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
    },
  });

  const items = list.data?.items ?? [];
  const unread = items.some((item) => !item.read);
  const text = (item: NotificationDto) => {
    const template =
      (m.notifications.kinds as Record<string, string>)[item.kind] ?? m.notifications.kinds.other;
    return format(template, {
      number: String(item.data['number'] ?? ''),
      poleCode: String(item.data['poleCode'] ?? ''),
    });
  };

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl }}
      refreshControl={
        <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
      }
      ListHeaderComponent={
        <View style={{ gap: spacing.sm }}>
          {list.isError ? <Message text={m.common.error} /> : null}
          {unread ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => markRead.mutate({ all: true })}
              style={styles.markAll}
            >
              <Text style={styles.markAllText}>{m.notifications.markAll}</Text>
            </Pressable>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        list.isLoading ? (
          <Text style={{ color: colors.muted }}>{m.common.loading}</Text>
        ) : (
          <EmptyState icon="mail-open-outline" title={m.notifications.empty} />
        )
      }
      renderItem={({ item }) => {
        const look = LOOK[item.kind] ?? { icon: 'notifications' as IconName, tone: 'neutral' };
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityHint={item.read ? undefined : m.notifications.unread}
            onPress={() => {
              if (!item.read) markRead.mutate({ ids: [item.id] });
              if (item.entityType === 'work_order' && item.entityId) {
                router.push({ pathname: '/job/[id]', params: { id: item.entityId } });
              }
            }}
            style={[styles.row, !item.read && styles.rowUnread]}
          >
            <IconCircle name={look.icon} tone={look.tone} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.text, !item.read && { fontWeight: '800' }]}>{text(item)}</Text>
              <Text style={styles.meta}>{relative(item.createdAt)}</Text>
            </View>
            {!item.read ? <View style={styles.dot} /> : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  markAll: { alignSelf: 'flex-end', minHeight: MIN_TOUCH, justifyContent: 'center' },
  markAllText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  row: {
    minHeight: MIN_TOUCH + 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowUnread: { borderColor: colors.primary, backgroundColor: colors.primarySubtle },
  text: { fontSize: 15, color: colors.foreground, fontWeight: '600' },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
});
