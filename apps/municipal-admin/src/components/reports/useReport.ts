'use client';

import type { ReportBreakdownDto, ReportSummaryDto } from '@smart-light/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Summary and breakdown for one period, loaded together. */
export function useReport(days: number) {
  const summary = useQuery({
    queryKey: ['reports', 'summary', days],
    queryFn: () => api.request<ReportSummaryDto>('/v1/reports/summary', { query: { days } }),
    placeholderData: keepPreviousData,
  });
  const breakdown = useQuery({
    queryKey: ['reports', 'breakdown', days],
    queryFn: () => api.request<ReportBreakdownDto>('/v1/reports/breakdown', { query: { days } }),
    placeholderData: keepPreviousData,
  });
  return {
    summary: summary.data,
    breakdown: breakdown.data,
    isError: summary.isError || breakdown.isError,
    isFetching: summary.isFetching || breakdown.isFetching,
    refetch: () => {
      void summary.refetch();
      void breakdown.refetch();
    },
  };
}

export function parseDays(value: string | null, periods: readonly number[]): number {
  const days = Number(value);
  return periods.includes(days) ? days : 30;
}
