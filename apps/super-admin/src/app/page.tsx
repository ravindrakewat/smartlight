import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
  StatCard,
  StatusIndicator,
  type Tone,
} from '@smart-light/ui';
import { Building2, CircleAlert, Cpu, Plus, Wifi } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import {
  previewOpenCriticalAlerts,
  previewTenants,
  type PreviewTenantStatus,
} from '@/lib/preview-data';

const TENANT_STATUS_TONES: Record<PreviewTenantStatus, Tone> = {
  active: 'success',
  onboarding: 'info',
  suspended: 'danger',
};

export default async function OverviewPage() {
  const t = await getTranslations('Overview');
  const tCommon = await getTranslations('Common');
  const tStatus = await getTranslations('TenantStatus');
  const format = await getFormatter();

  const totalDevices = previewTenants.reduce((sum, tenant) => sum + tenant.devices, 0);
  const totalOnline = previewTenants.reduce((sum, tenant) => sum + tenant.online, 0);
  const percent = (part: number, whole: number) =>
    format.number(whole === 0 ? 0 : part / whole, { style: 'percent', maximumFractionDigits: 1 });

  /* Real service checks arrive with the API health aggregation; until then show the truth. */
  const services = [
    { key: 'api', connected: false },
    { key: 'database', connected: false },
    { key: 'broker', connected: false },
    { key: 'queue', connected: false },
  ] as const;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <Badge tone="warning">{tCommon('previewData')}</Badge>
            <Button asChild>
              <Link href="/municipalities">
                <Plus />
                {t('tenants.onboard')}
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label={t('title')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('stats.municipalities')}
          value={format.number(previewTenants.length)}
          icon={<Building2 />}
          tone="info"
        />
        <StatCard
          label={t('stats.devices')}
          value={format.number(totalDevices)}
          icon={<Cpu />}
          tone="neutral"
        />
        <StatCard
          label={t('stats.online')}
          value={format.number(totalOnline)}
          hint={t('stats.onlineHint', { percent: percent(totalOnline, totalDevices) })}
          icon={<Wifi />}
          tone="success"
        />
        <StatCard
          label={t('stats.alerts')}
          value={format.number(previewOpenCriticalAlerts)}
          icon={<CircleAlert />}
          tone="danger"
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>{t('tenants.title')}</CardTitle>
              <CardDescription>{t('tenants.description')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th scope="col" className="py-3 pr-4 font-medium">
                    {t('tenants.name')}
                  </th>
                  <th scope="col" className="py-3 pr-4 text-right font-medium">
                    {t('tenants.devices')}
                  </th>
                  <th scope="col" className="py-3 pr-4 text-right font-medium">
                    {t('tenants.online')}
                  </th>
                  <th scope="col" className="py-3 font-medium">
                    {t('tenants.status')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {previewTenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <th scope="row" className="py-3 pr-4 font-medium">
                      <span className="block">{tenant.name}</span>
                      <span className="block font-mono text-xs font-normal text-muted-foreground">
                        {tenant.id}
                      </span>
                    </th>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {format.number(tenant.devices)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {tenant.devices === 0 ? '—' : percent(tenant.online, tenant.devices)}
                    </td>
                    <td className="py-3">
                      <Badge tone={TENANT_STATUS_TONES[tenant.status]}>
                        {tStatus(tenant.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t('health.title')}</CardTitle>
              <CardDescription>{t('health.description')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {services.map((service) => (
                <li key={service.key} className="flex items-center justify-between gap-3 py-3">
                  <span className="font-medium">{t(`health.${service.key}`)}</span>
                  <StatusIndicator
                    status={service.connected ? 'on' : 'off'}
                    label={service.connected ? t('health.operational') : t('health.notConnected')}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
