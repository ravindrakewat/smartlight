'use client';

import { REPORT_PERIODS } from '@smart-light/shared';
import { Alert, Button, Skeleton } from '@smart-light/ui';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { ReportView } from '@/components/reports/ReportView';
import { parseDays, useReport } from '@/components/reports/useReport';
import { useSessionUser } from '@/components/Session';

/** A4 print view of the report; the browser's "Save as PDF" produces the PDF. */
function PrintReport() {
  const t = useTranslations('Reports');
  const tCommon = useTranslations('Common');
  const format = useFormatter();
  const user = useSessionUser();
  const days = parseDays(useSearchParams().get('days'), REPORT_PERIODS);
  const report = useReport(days);
  const sources = report.breakdown?.dataSources;
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="outline">
          <Link href={`/reports?days=${days}`}>
            <ArrowLeft aria-hidden="true" />
            {t('backToReports')}
          </Link>
        </Button>
        <Button onClick={() => window.print()} disabled={!report.summary || !report.breakdown}>
          <Printer aria-hidden="true" />
          {t('print')}
        </Button>
      </div>

      <header className="mb-6 border-b-2 border-foreground pb-3">
        <p className="text-sm text-muted-foreground">{user.tenant?.name ?? ''}</p>
        <h1 className="text-2xl font-bold">{t('printTitle')}</h1>
        {report.summary ? (
          <p className="text-sm text-muted-foreground">
            {t('printPeriod', { from: date(report.summary.from), to: date(report.summary.to) })}
          </p>
        ) : null}
      </header>

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
          {tCommon('errorBody')}
        </Alert>
      ) : report.summary && report.breakdown ? (
        <ReportView summary={report.summary} breakdown={report.breakdown} days={days} printable />
      ) : (
        <Skeleton className="h-96" />
      )}
    </>
  );
}

export default function PrintReportPage() {
  return (
    <Suspense>
      <PrintReport />
    </Suspense>
  );
}
