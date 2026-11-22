'use client';

import { ApiClientError, type LightStatusName, type PublicPoleDto } from '@smart-light/shared';
import { Alert, Button, Card, Skeleton, StatusIndicator, type LightStatus } from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin, Navigation } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';

export const LIGHT_INDICATOR: Record<LightStatusName, LightStatus> = {
  UNKNOWN: 'off',
  ON: 'on',
  DIMMED: 'dimmed',
  OFF: 'off',
  FAULT: 'fault',
  OFFLINE: 'off',
};

export function PoleView({ code }: { code: string }) {
  const t = useTranslations('Pole');
  const tCommon = useTranslations('Common');
  const tLight = useTranslations('LightStatus');
  const format = useFormatter();
  const locale = useLocale();

  const {
    data: pole,
    error,
    isPending,
  } = useQuery({
    queryKey: ['public-pole', code],
    queryFn: () => api.request<PublicPoleDto>(`/v1/public/poles/${encodeURIComponent(code)}`),
  });

  if (isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (error || !pole) {
    const notFound =
      error instanceof ApiClientError &&
      (error.status === 404 || error.code === 'INVALID_POLE_CODE');
    return (
      <Alert
        tone={notFound ? 'warning' : 'danger'}
        title={notFound ? t('notFound') : tCommon('errorTitle')}
      >
        {notFound ? t('notFoundBody') : tCommon('errorBody')}
      </Alert>
    );
  }

  const tenantName = locale === 'hi' ? pole.tenant.nameHi : pole.tenant.name;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${pole.latitude},${pole.longitude}`;

  return (
    <div className="grid gap-5">
      <div>
        <p className="text-sm font-semibold text-primary">{tenantName}</p>
        <h1 className="mt-1 text-3xl font-bold">{t('title', { code: pole.code })}</h1>
        {pole.address || pole.zoneName ? (
          <p className="mt-2 flex items-start gap-2 text-muted-foreground">
            <MapPin aria-hidden="true" className="mt-1 size-4 shrink-0" />
            {[pole.address, pole.zoneName].filter(Boolean).join(' · ')}
          </p>
        ) : null}
      </div>

      <Card className="p-5">
        <p className="text-sm font-medium text-muted-foreground">{t('liveStatus')}</p>
        <StatusIndicator
          className="mt-2 text-lg"
          status={LIGHT_INDICATOR[pole.lightStatus]}
          label={tLight(pole.lightStatus)}
        />
        {pole.lightStatusAt ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {t('updated', { time: format.relativeTime(new Date(pole.lightStatusAt)) })}
          </p>
        ) : null}
      </Card>

      {pole.openRepair ? (
        <Alert tone="info" icon={<Clock />} title={t('openRepair')}>
          {t('openRepairBody', {
            date: format.dateTime(new Date(pole.openRepair.slaDueAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          })}
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button asChild size="lg">
          <Link href={{ pathname: '/report', query: { pole: pole.code } }}>{t('report')}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <Navigation />
            {t('directions')}
          </a>
        </Button>
      </div>
    </div>
  );
}
