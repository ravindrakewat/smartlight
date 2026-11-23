import type { WorkOrderSummaryDto } from '@smart-light/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { AppButton, Badge, Card, Message } from '../../src/components/ui';
import { useI18n, useRelativeTime } from '../../src/i18n';
import { api } from '../../src/lib/api';
import { faultLabel, PRIORITY_TONES, STATUS_TONES } from '../../src/lib/labels';
import { useSession } from '../../src/lib/session';
import { colors, spacing } from '../../src/theme';

export default function JobsScreen() {
  const { messages: m, format } = useI18n();
  const relative = useRelativeTime();
  const { user } = useSession();
  const router = useRouter();

  const jobs = useQuery({
    queryKey: ['my-jobs'],
    queryFn: () =>
      api.page<WorkOrderSummaryDto>('/v1/work-orders', { query: { open: true, pageSize: 50 } }),
    refetchInterval: 60_000,
  });

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <AppButton
              label={m.profile.title}
              variant="ghost"
              onPress={() => router.push('/profile')}
            />
          ),
        }}
      />
      <FlatList
        data={jobs.data?.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        refreshControl={
          <RefreshControl refreshing={jobs.isRefetching} onRefresh={() => void jobs.refetch()} />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            {user ? <Text style={{ fontSize: 15, color: colors.muted }}>{user.name}</Text> : null}
            <AppButton label={m.jobs.scan} variant="outline" onPress={() => router.push('/scan')} />
            {jobs.error ? <Message text={m.common.error} /> : null}
          </View>
        }
        ListEmptyComponent={
          jobs.isPending ? (
            <Text style={{ textAlign: 'center', color: colors.muted }}>{m.common.loading}</Text>
          ) : (
            <Message tone="success" text={m.jobs.empty} />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/job/[id]', params: { id: item.id } })}
          >
            <Card style={item.overdue ? { borderColor: colors.danger, borderWidth: 2 } : undefined}>
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}
              >
                <Text
                  style={{ flex: 1, fontSize: 18, fontWeight: '700', color: colors.foreground }}
                >
                  {faultLabel(m, item.faultType)}
                </Text>
                <Badge label={m.priority[item.priority]} tone={PRIORITY_TONES[item.priority]} />
              </View>
              <Text style={{ fontSize: 16, fontFamily: 'monospace', color: colors.foreground }}>
                {item.pole.code}
              </Text>
              {item.pole.address ? (
                <Text style={{ fontSize: 15, color: colors.muted }}>{item.pole.address}</Text>
              ) : null}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  flexWrap: 'wrap',
                }}
              >
                <Badge label={m.status[item.status]} tone={STATUS_TONES[item.status]} />
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: item.overdue ? '700' : '400',
                    color: item.overdue ? colors.danger : colors.muted,
                  }}
                >
                  {item.overdue ? `${m.jobs.overdue} · ` : ''}
                  {format(m.jobs.due, { time: relative(item.slaDueAt) })}
                </Text>
              </View>
            </Card>
          </Pressable>
        )}
      />
    </>
  );
}
