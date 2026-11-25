import type { DeviceEventDto, WorkOrderSummaryDto } from '@smart-light/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** The technician's open jobs (the API returns only their own). */
export function useMyJobs() {
  return useQuery({
    queryKey: ['my-jobs'],
    queryFn: () =>
      api.page<WorkOrderSummaryDto>('/v1/work-orders', { query: { open: true, pageSize: 100 } }),
    refetchInterval: 60_000,
  });
}

/** Finished jobs: waiting for verification and verified. */
export function useJobHistory() {
  return useQuery({
    queryKey: ['my-jobs', 'history'],
    queryFn: async () => {
      const [pending, resolved] = await Promise.all([
        api.page<WorkOrderSummaryDto>('/v1/work-orders', {
          query: { status: 'PENDING_VERIFICATION', pageSize: 100 },
        }),
        api.page<WorkOrderSummaryDto>('/v1/work-orders', {
          query: { status: 'RESOLVED', pageSize: 100 },
        }),
      ]);
      return [...pending.items, ...resolved.items].sort(
        (a, b) =>
          new Date(b.completedAt ?? b.createdAt).getTime() -
          new Date(a.completedAt ?? a.createdAt).getTime(),
      );
    },
  });
}

/** Controller alerts in the city (open only unless `all`). */
export function useAlerts(severity: '' | DeviceEventDto['severity'] = '', all = false) {
  return useQuery({
    queryKey: ['alerts', severity, all],
    queryFn: () =>
      api.page<DeviceEventDto>('/v1/alerts', {
        query: { severity, open: String(!all), pageSize: 50 },
      }),
    refetchInterval: 60_000,
  });
}

export function useOpenAlertCount(): number | null {
  const { data } = useQuery({
    queryKey: ['alerts', 'open-count'],
    queryFn: () => api.page<DeviceEventDto>('/v1/alerts', { query: { pageSize: 1 } }),
    refetchInterval: 60_000,
    retry: false,
  });
  return data ? data.pagination.totalItems : null;
}

/** Unread in-app notifications of the signed-in person (header badge). */
export function useUnreadNotifications() {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.request<{ unread: number }>('/v1/notifications/unread-count'),
    refetchInterval: 60_000,
  });
}
