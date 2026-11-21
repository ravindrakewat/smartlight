import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  StatCard,
} from '@smart-light/ui';
import { CircleAlert, Lightbulb, MapPinned, PlugZap, WifiOff, Zap } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { previewAlerts, previewSummary, previewZones } from '@/lib/preview-data';

export default async function DashboardPage() {
  const t = await getTranslations('Dashboard');
  const tCommon = await getTranslations('Common');
  const tAlert = await getTranslations('AlertTypes');
  const tSeverity = await getTranslations('Severity');
  const format = await getFormatter();
  const now = new Date();

  const percent = (part: number, whole: number) =>
    format.number(whole === 0 ? 0 : part / whole, { style: 'percent', maximumFractionDigits: 1 });

  const summary = previewSummary;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={<Badge tone="warning">{tCommon('previewData')}</Badge>}
      />

      <section aria-label={t('title')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label={t('stats.totalLights')}
          value={format.number(summary.totalLights)}
          icon={<Lightbulb />}
          tone="info"
        />
        <StatCard
          label={t('stats.working')}
          value={format.number(summary.working)}
          hint={t('stats.shareOfTotal', { percent: percent(summary.working, summary.totalLights) })}
          icon={<Zap />}
          tone="success"
        />
        <StatCard
          label={t('stats.faulty')}
          value={format.number(summary.faulty)}
          hint={t('stats.shareOfTotal', { percent: percent(summary.faulty, summary.totalLights) })}
          icon={<CircleAlert />}
          tone="danger"
        />
        <StatCard
          label={t('stats.offline')}
          value={format.number(summary.offline)}
          hint={t('stats.shareOfTotal', { percent: percent(summary.offline, summary.totalLights) })}
          icon={<WifiOff />}
          tone="warning"
        />
        <StatCard
          label={t('stats.energyToday')}
          value={t('stats.energyValue', {
            value: format.number(summary.energyTodayKwh, { maximumFractionDigits: 0 }),
          })}
          hint={t('stats.energyHint', {
            percent: format.number(summary.dimmingSavingsRatio, { style: 'percent' }),
          })}
          icon={<PlugZap />}
          tone="neutral"
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>{t('map.title')}</CardTitle>
              <CardDescription>{t('map.description')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <EmptyState
              className="min-h-80"
              icon={<MapPinned />}
              title={t('map.emptyTitle')}
              description={t('map.emptyDescription')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t('alerts.title')}</CardTitle>
              <CardDescription>{t('alerts.description')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {previewAlerts.map((alert) => (
                <li key={alert.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{tAlert(alert.type)}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('alerts.pole', { code: alert.poleCode })} · {alert.zone}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={alert.severity === 'critical' ? 'danger' : 'warning'}>
                      {tSeverity(alert.severity)}
                    </Badge>
                    <time
                      className="text-xs text-muted-foreground"
                      dateTime={new Date(now.getTime() - alert.minutesAgo * 60_000).toISOString()}
                    >
                      {format.relativeTime(
                        new Date(now.getTime() - alert.minutesAgo * 60_000),
                        now,
                      )}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-3 w-full">
              <Link href="/alerts">{t('alerts.viewAll')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle>{t('zones.title')}</CardTitle>
            <CardDescription>{t('zones.description')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th scope="col" className="py-3 pr-4 font-medium">
                  {t('zones.zone')}
                </th>
                <th scope="col" className="py-3 pr-4 text-right font-medium">
                  {t('zones.total')}
                </th>
                <th scope="col" className="py-3 pr-4 text-right font-medium">
                  {t('zones.working')}
                </th>
                <th scope="col" className="py-3 pr-4 text-right font-medium">
                  {t('zones.faulty')}
                </th>
                <th scope="col" className="py-3 font-medium">
                  {t('zones.availability')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {previewZones.map((zone) => {
                const availability = zone.working / zone.total;
                return (
                  <tr key={zone.name}>
                    <th scope="row" className="py-3 pr-4 font-medium">
                      {zone.name}
                    </th>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {format.number(zone.total)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {format.number(zone.working)}
                    </td>
                    <td className="py-3 pr-4 text-right text-danger tabular-nums">
                      {format.number(zone.faulty)}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-2 w-full max-w-40 overflow-hidden rounded-full bg-surface-subtle"
                          aria-hidden="true"
                        >
                          <div
                            className="h-full rounded-full bg-success"
                            style={{ width: `${availability * 100}%` }}
                          />
                        </div>
                        <span className="tabular-nums">{percent(zone.working, zone.total)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
