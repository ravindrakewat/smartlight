import type { WorkOrderSummaryDto } from '@smart-light/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { JobCard } from '../../../src/components/JobCard';
import {
  ChipRow,
  EmptyState,
  HeaderButton,
  NavyHeader,
  SearchField,
} from '../../../src/components/kit';
import { Message } from '../../../src/components/ui';
import { useI18n } from '../../../src/i18n';
import { useMyJobs } from '../../../src/lib/queries';
import { spacing } from '../../../src/theme';

const FILTERS = ['all', 'todo', 'progress', 'verification', 'overdue'] as const;
type Filter = (typeof FILTERS)[number];

const MATCHES: Record<Filter, (job: WorkOrderSummaryDto) => boolean> = {
  all: () => true,
  todo: (job) => job.status === 'ASSIGNED' || job.status === 'OPEN',
  progress: (job) => job.status === 'IN_PROGRESS',
  verification: (job) => job.status === 'PENDING_VERIFICATION',
  overdue: (job) => job.overdue,
};

export default function WorkScreen() {
  const { messages: m } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const jobs = useMyJobs();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  // Summary tiles on Home open this tab with a filter.
  useEffect(() => {
    if (params.filter && (FILTERS as readonly string[]).includes(params.filter)) {
      setFilter(params.filter as Filter);
    }
  }, [params.filter]);

  const items = useMemo(() => jobs.data?.items ?? [], [jobs.data]);
  const query = search.trim().toLowerCase();
  const visible = items
    .filter(MATCHES[filter])
    .filter(
      (job) =>
        !query ||
        job.number.toLowerCase().includes(query) ||
        job.pole.code.toLowerCase().includes(query) ||
        (job.pole.address ?? '').toLowerCase().includes(query) ||
        (job.pole.zoneName ?? '').toLowerCase().includes(query),
    )
    // Overdue first, then the nearest deadline.
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime(),
    );

  return (
    <View style={{ flex: 1 }}>
      <NavyHeader
        title={m.work.title}
        subtitle={m.work.subtitle}
        right={
          <HeaderButton
            icon="time-outline"
            label={m.history.title}
            onPress={() => router.push('/history')}
          />
        }
      >
        <SearchField value={search} onChangeText={setSearch} placeholder={m.work.search} />
        <View style={{ marginHorizontal: -spacing.lg }}>
          <ChipRow<Filter>
            label={m.work.filter}
            onNavy
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((value) => ({
              value,
              label: m.work.filters[value],
              count: jobs.data ? items.filter(MATCHES[value]).length : undefined,
            }))}
          />
        </View>
      </NavyHeader>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl refreshing={jobs.isRefetching} onRefresh={() => void jobs.refetch()} />
        }
        ListHeaderComponent={jobs.error ? <Message text={m.common.error} /> : undefined}
        ListEmptyComponent={
          jobs.isPending ? undefined : (
            <EmptyState
              icon="checkmark-done"
              title={query || filter !== 'all' ? m.work.noMatch : m.jobs.empty}
            />
          )
        }
        renderItem={({ item }) => (
          <JobCard
            job={item}
            onPress={() => router.push({ pathname: '/job/[id]', params: { id: item.id } })}
          />
        )}
      />
    </View>
  );
}
