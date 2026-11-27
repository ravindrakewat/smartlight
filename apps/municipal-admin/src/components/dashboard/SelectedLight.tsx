'use client';

import type { PoleDto, PoleLiveDto } from '@smart-light/shared';
import { Alert, Badge, Skeleton, StreetPole } from '@smart-light/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, MousePointerClick, Wifi, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { LightStatusLabel } from '@/components/labels';
import { ControlPanel } from '@/components/lighting/ControlPanel';
import { STREET_STATUS } from '@/components/lighting/ZoneStreet';
import { api } from '@/lib/api';

const REFRESH_MS = 15_000;
/** Same follow-up reads as the pole page after a command. */
const COMMAND_REFRESH_MS = [1_500, 4_000, 8_000] as const;

/**
 * The pole picked on the dashboard map: its details and, for control-room roles,
 * the same controls as the pole page (same commands, durations and auto return).
 */
export function SelectedLight({
  poleId,
  canControl,
}: {
  poleId: string | null;
  canControl: boolean;
}) {
  const t = useTranslations('Dashboard.selected');
  const tPole = useTranslations('Lighting.pole');
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const queryClient = useQueryClient();

  const pole = useQuery({
    queryKey: ['pole', poleId],
    queryFn: () => api.request<PoleDto>(`/v1/poles/${poleId}`),
    enabled: poleId !== null,
    refetchInterval: REFRESH_MS,
  });
  const live = useQuery({
    queryKey: ['pole-live', poleId],
    queryFn: () => api.request<PoleLiveDto>(`/v1/poles/${poleId}/live`),
    enabled: poleId !== null,
    refetchInterval: REFRESH_MS,
  });

  if (poleId === null) {
    return (
      <div className="grid min-h-60 place-items-center rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        <span className="grid justify-items-center gap-2">
          <MousePointerClick aria-hidden="true" className="size-6" />
          {t('pick')}
        </span>
      </div>
    );
  }
  if (pole.error || live.error) {
    return <Alert tone="danger">{t('failed')}</Alert>;
  }
  if (!pole.data || !live.data) {
    return <Skeleton className="h-80" />;
  }

  const info = pole.data;
  const device = live.data.device;
  const ago = (iso: string | null) =>
    iso
      ? format.relativeTime(new Date(Math.min(new Date(iso).getTime(), now.getTime())), now)
      : tPole('never');
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['pole-live', poleId] });
    void queryClient.invalidateQueries({ queryKey: ['pole', poleId] });
  };

  const rows: [string, string][] = [
    [t('poleId'), info.code],
    [t('location'), info.address ?? '—'],
    [t('zone'), info.zone?.name ?? '—'],
    [
      t('model'),
      [info.wattage ? `${info.wattage} W` : null, info.lampType].filter(Boolean).join(' ') || '—',
    ],
    [t('controller'), device?.deviceId ?? t('noController')],
    [t('lastUpdate'), ago(device?.lastTelemetryAt ?? null)],
  ];

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
        <div className="relative flex min-h-36 items-end justify-center overflow-hidden rounded-xl bg-[radial-gradient(120%_100%_at_50%_0%,var(--color-night-soft),var(--color-night))] pt-3">
          <StreetPole
            status={STREET_STATUS[info.lightStatus]}
            dimPercent={device?.lampOn ? device.dimPercent : null}
            size="sm"
            className="relative z-10 -mb-1"
          />
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-3 bg-road" />
        </div>
        <div className="grid min-w-0 content-start gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <LightStatusLabel status={info.lightStatus} />
            {device ? (
              <Badge tone={device.online ? 'success' : 'warning'}>
                {device.online ? (
                  <Wifi aria-hidden="true" className="size-3.5" />
                ) : (
                  <WifiOff aria-hidden="true" className="size-3.5" />
                )}
                {device.online ? tPole('readings.online') : tPole('readings.offline')}
              </Badge>
            ) : null}
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="truncate font-medium" title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {device && canControl ? (
        <ControlPanel
          key={poleId}
          target={{ type: 'pole', poleId: info.id }}
          reported={{
            online: device.online,
            lampOn: device.lampOn,
            dimPercent: device.dimPercent,
            mode: device.mode,
          }}
          onSent={() => {
            refresh();
            for (const delay of COMMAND_REFRESH_MS) setTimeout(refresh, delay);
          }}
        />
      ) : null}

      <Link
        href={`/poles/${info.id}`}
        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline"
      >
        {t('openPole', { code: info.code })}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
}
