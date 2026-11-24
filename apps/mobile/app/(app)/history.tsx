import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { JobCard } from '../../src/components/JobCard';
import { ChipRow, EmptyState, SearchField } from '../../src/components/kit';
import { Message } from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { useJobHistory } from '../../src/lib/queries';
import { colors, spacing } from '../../src/theme';

type Filter = 'all' | 'verified' | 'waiting';

/** Jobs you finished: waiting for verification, and verified. */
export default function HistoryScreen() {
  const { messages: m } = useI18n();
  const router = useRouter();
  const history = useJobHistory();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const items = history.data ?? [];
  const query = search.trim().toLowerCase();
  const visible = items
    .filter((job) =>
      filter === 'verified'
        ? job.status === 'RESOLVED'
        : filter === 'waiting'
          ? job.status === 'PENDING_VERIFICATION'
          : true,
    )
    .filter(
      (job) =>
        !query ||
        job.number.toLowerCase().includes(query) ||
        job.pole.code.toLowerCase().includes(query) ||
        (job.pole.address ?? '').toLowerCase().includes(query),
    );

  return (
    <FlatList
      data={visible}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
      refreshControl={
        <RefreshControl
          refreshing={history.isRefetching}
          onRefresh={() => void history.refetch()}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: spacing.md, marginBottom: spacing.xs }}>
          <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 999 }}>
            <SearchField value={search} onChangeText={setSearch} placeholder={m.work.search} />
          </View>
          <View style={{ marginHorizontal: -spacing.lg }}>
            <ChipRow<Filter>
              label={m.work.filter}
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: m.history.all, count: items.length },
                {
                  value: 'verified',
                  label: m.history.verified,
                  count: items.filter((job) => job.status === 'RESOLVED').length,
                },
                {
                  value: 'waiting',
                  label: m.history.waiting,
                  count: items.filter((job) => job.status === 'PENDING_VERIFICATION').length,
                },
              ]}
            />
          </View>
          {history.error ? <Message text={m.common.error} /> : null}
        </View>
      }
      ListEmptyComponent={
        history.isPending ? undefined : (
          <EmptyState icon="file-tray-outline" title={m.history.empty} />
        )
      }
      renderItem={({ item }) => (
        <JobCard
          job={item}
          onPress={() => router.push({ pathname: '/job/[id]', params: { id: item.id } })}
        />
      )}
    />
  );
}
