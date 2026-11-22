'use client';

import type { TenantDto } from '@smart-light/shared';
import { Badge, type Tone } from '@smart-light/ui';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

const STATUS_TONES: Record<TenantDto['status'], Tone> = {
  ACTIVE: 'success',
  ONBOARDING: 'info',
  SUSPENDED: 'danger',
};

export function TenantStatusBadge({ status }: { status: TenantDto['status'] }) {
  const t = useTranslations('TenantStatus');
  return (
    <Badge tone={STATUS_TONES[status]}>
      {t(status.toLowerCase() as 'active' | 'onboarding' | 'suspended')}
    </Badge>
  );
}

export function TenantsTable({
  tenants,
  actions,
}: {
  tenants: TenantDto[];
  actions?: (tenant: TenantDto) => ReactNode;
}) {
  const t = useTranslations('Overview.tenants');
  const format = useFormatter();
  const locale = useLocale();
  const percent = (part: number, whole: number) =>
    whole === 0 ? '—' : format.number(part / whole, { style: 'percent', maximumFractionDigits: 1 });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th scope="col" className="py-3 pr-4 font-medium">
              {t('name')}
            </th>
            <th scope="col" className="py-3 pr-4 text-right font-medium">
              {t('devices')}
            </th>
            <th scope="col" className="py-3 pr-4 text-right font-medium">
              {t('online')}
            </th>
            <th scope="col" className="py-3 pr-4 text-right font-medium">
              {t('users')}
            </th>
            <th scope="col" className="py-3 pr-4 font-medium">
              {t('status')}
            </th>
            {actions ? (
              <th scope="col" className="py-3 font-medium">
                <span className="sr-only">—</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {tenants.map((tenant) => (
            <tr key={tenant.id}>
              <th scope="row" className="py-3 pr-4 font-medium">
                <span className="block">{locale === 'hi' ? tenant.nameHi : tenant.name}</span>
                <span className="block font-mono text-xs font-normal text-muted-foreground">
                  {tenant.code} · {tenant.slug}
                </span>
              </th>
              <td className="py-3 pr-4 text-right tabular-nums">
                {format.number(tenant.stats.devices)}
              </td>
              <td className="py-3 pr-4 text-right tabular-nums">
                {percent(tenant.stats.devicesOnline, tenant.stats.devices)}
              </td>
              <td className="py-3 pr-4 text-right tabular-nums">
                {format.number(tenant.stats.users)}
              </td>
              <td className="py-3 pr-4">
                <TenantStatusBadge status={tenant.status} />
              </td>
              {actions ? <td className="py-3 text-right">{actions(tenant)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
