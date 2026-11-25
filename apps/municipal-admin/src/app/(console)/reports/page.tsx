'use client';

import { REPORT_PERIODS } from '@smart-light/shared';
import { Alert, Button, Select, Skeleton } from '@smart-light/ui';
import { Download, FileBarChart, Printer } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useId } from 'react';
import { ReportView } from '@/components/reports/ReportView';
import { parseDays, useReport } from '@/components/reports/useReport';
import { ConsoleHero } from '@/components/shell/ConsoleHero';
import { municipalEnv } from '@/lib/env';

function ReportsContent() {
  const t = useTranslations('Reports');
  const tCommon = useTranslations('Common');
  const router = useRouter();
  const params = useSearchParams();
  const days = parseDays(params.get('days'), REPORT_PERIODS);
  const periodId = useId();
  const report = useReport(days);
  const sources = report.breakdown?.dataSources;

  return (
    <>
      <ConsoleHero
        title={t('title')}
        description={t('description')}
        icon={<FileBarChart />}
        actions={
          <>
            <div className="flex items-center gap-2">
              <label htmlFor={periodId} className="text-sm font-medium">
                {t('period')}
              </label>
              <Select
                id={periodId}
                value={String(days)}
                onChange={(event) => router.replace(`/reports?days=${event.target.value}`)}
              >
                {REPORT_PERIODS.map((period) => (
                  <option key={period} value={period}>
                    {t('lastDays', { days: period })}
                  </option>
                ))}
              </Select>
            </div>
            <Button asChild variant="outline">
              <a
                href={`${municipalEnv.NEXT_PUBLIC_API_BASE_URL}/v1/reports/work-orders.csv?days=${days}`}
                download
              >
                <Download aria-hidden="true" />
                {t('workOrdersCsv')}
              </a>
            </Button>
            <Button asChild>
              <Link href={`/print/reports?days=${days}`} target="_blank">
                <Printer aria-hidden="true" />
                {t('printPdf')}
              </Link>
            </Button>
          </>
        }
      />

      {sources && sources.simulatedControllersReporting > 0 ? (
        <Alert tone="warning" title={t('simulatedTitle')} className="mb-6">
          {t('simulatedBody', {
            simulated: sources.simulatedControllersReporting,
            total: sources.controllersReporting,
          })}
        </Alert>
      ) : null}

      {report.isError ? (
        <Alert tone="danger" title={tCommon('errorTitle')}>
          <p>{tCommon('errorBody')}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={report.refetch}>
            {tCommon('retry')}
          </Button>
        </Alert>
      ) : report.summary && report.breakdown ? (
        <div aria-busy={report.isFetching}>
          <ReportView summary={report.summary} breakdown={report.breakdown} days={days} />
        </div>
      ) : (
        <div className="space-y-6" aria-label={tCommon('loading')}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
          <Skeleton className="h-80" />
        </div>
      )}
    </>
  );
}

export default function ReportsPage() {
  return (
    <Suspense>
      <ReportsContent />
    </Suspense>
  );
}
