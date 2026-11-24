import type { DeviceEventDto } from '@smart-light/shared';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { AlertRow } from '../../../src/components/AlertRow';
import { ChipRow, EmptyState, NavyHeader } from '../../../src/components/kit';
import { Message } from '../../../src/components/ui';
import { useI18n } from '../../../src/i18n';
import { useAlerts } from '../../../src/lib/queries';
import { colors, radius, shadow, spacing } from '../../../src/theme';

type Filter = '' | DeviceEventDto['severity'] | 'history';

/** Controller faults in the city; faults on poles of your jobs reach you as work orders. */
export default function AlertsScreen() {
  const { messages: m } = useI18n();
  const [filter, setFilter] = useState<Filter>('');
  const alerts = useAlerts(filter === 'history' ? '' : filter, filter === 'history');

  return (
    <View style={{ flex: 1 }}>
      <NavyHeader title={m.alerts.title} subtitle={m.alerts.subtitle}>
        <View style={{ marginHorizontal: -spacing.lg }}>
          <ChipRow<Filter>
            label={m.alerts.filter}
            onNavy
            value={filter}
            onChange={setFilter}
            options={[
              { value: '', label: m.alerts.open },
              { value: 'critical', label: m.alerts.severity.critical },
              { value: 'warning', label: m.alerts.severity.warning },
              { value: 'info', label: m.alerts.severity.info },
              { value: 'history', label: m.alerts.all },
            ]}
          />
        </View>
      </NavyHeader>
      <FlatList
        data={alerts.data?.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={alerts.isRefetching}
            onRefresh={() => void alerts.refetch()}
          />
        }
        ListHeaderComponent={alerts.error ? <Message text={m.common.error} /> : undefined}
        ListEmptyComponent={
          alerts.isPending ? undefined : (
            <EmptyState icon="shield-checkmark" title={m.alerts.empty} />
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <AlertRow alert={item} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    ...shadow,
  },
});
