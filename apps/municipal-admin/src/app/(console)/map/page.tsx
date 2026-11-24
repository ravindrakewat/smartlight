'use client';

import { LIGHT_STATUSES, type LightStatusName, type PoleMapItemDto } from '@smart-light/shared';
import { Alert, Button, Card, CardContent, Skeleton } from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import { Map as MapIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { LightStatusLabel } from '@/components/labels';
import { api } from '@/lib/api';
import { ConsoleHero } from '@/components/shell/ConsoleHero';

/** MapLibre needs the browser (WebGL); load it only on this page. */
const PoleMap = dynamic(
  () => import('@/components/lighting/PoleMap').then((module) => module.PoleMap),
  { ssr: false, loading: () => <Skeleton className="h-[65vh] min-h-96" /> },
);

export default function MapPage() {
  const t = useTranslations('Lighting.map');
  const tCommon = useTranslations('Common');
  const tLight = useTranslations('LightStatus');
  const format = useFormatter();
  const router = useRouter();

  const poles = useQuery({
    queryKey: ['pole-map'],
    queryFn: () => api.request<PoleMapItemDto[]>('/v1/poles/map'),
    refetchInterval: 60_000,
  });

  const counts = new Map<LightStatusName, number>();
  for (const pole of poles.data ?? []) {
    counts.set(pole.lightStatus, (counts.get(pole.lightStatus) ?? 0) + 1);
  }

  return (
    <>
      <ConsoleHero
        icon={<MapIcon />}
        title={t('title')}
        description={t('description')}
        actions={
          <Button asChild variant="secondary">
            <Link href="/poles">{t('asList')}</Link>
          </Button>
        }
      />

      {poles.error ? (
        <Alert tone="danger" title={tCommon('errorTitle')}>
          {tCommon('errorBody')}
        </Alert>
      ) : null}

      <div className="grid gap-4">
        <Card>
          <CardContent className="pt-5">
            <h2 className="sr-only">{t('legend')}</h2>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-live="polite">
              {LIGHT_STATUSES.map((status) => (
                <li key={status} className="flex items-center gap-2">
                  <LightStatusLabel status={status} />
                  <span className="font-semibold tabular-nums">
                    {format.number(counts.get(status) ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {poles.data ? (
          poles.data.length === 0 ? (
            <Alert tone="info">{t('empty')}</Alert>
          ) : (
            <PoleMap
              poles={poles.data}
              label={t('label', { count: poles.data.length })}
              statusLabel={(status) => tLight(status)}
              openLabel={t('open')}
              onOpen={(poleId) => router.push(`/poles/${poleId}`)}
            />
          )
        ) : (
          <Skeleton className="h-[65vh] min-h-96" />
        )}
        <p className="text-xs text-muted-foreground">{t('attribution')}</p>
      </div>
    </>
  );
}
