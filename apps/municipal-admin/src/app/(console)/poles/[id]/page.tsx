'use client';

import type { PoleDto, PoleLiveDto } from '@smart-light/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  StreetPole,
} from '@smart-light/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Cpu, ExternalLink, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LightStatusLabel, useFaultLabel } from '@/components/labels';
import { CommandHistory } from '@/components/lighting/CommandHistory';
import { ControlPanel } from '@/components/lighting/ControlPanel';
import { PowerChart } from '@/components/lighting/PowerChart';
import { STREET_STATUS } from '@/components/lighting/ZoneStreet';
import { useSessionUser } from '@/components/Session';
import { api } from '@/lib/api';

const CONTROLLERS = new Set(['SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'SUPERVISOR', 'OPERATOR']);
const LIVE_REFRESH_MS = 15_000;
/**
 * Re-read after a command: the worker picks commands up every 1.5 s and the controller
 * reports its new state right after applying one, so most changes show at the first or
 * second refresh; the last catches a slow link.
 */
const COMMAND_REFRESH_MS = [1_500, 4_000, 8_000] as const;

function Reading({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-subtle/60 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export default function PoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('Lighting.pole');
  const tCommon = useTranslations('Common');
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const faultLabel = useFaultLabel();
  const user = useSessionUser();
  const queryClient = useQueryClient();

  // The server derives lightStatus (on/off/dimmed/fault) from each report: refresh it with the
  // live readings so the pole picture and status label follow the lamp.
  const pole = useQuery({
    queryKey: ['pole', id],
    queryFn: () => api.request<PoleDto>(`/v1/poles/${id}`),
    refetchInterval: LIVE_REFRESH_MS,
  });
  const live = useQuery({
    queryKey: ['pole-live', id],
    queryFn: () => api.request<PoleLiveDto>(`/v1/poles/${id}/live`),
    refetchInterval: LIVE_REFRESH_MS,
  });

  if (pole.error || live.error) {
    return (
      <Alert tone="danger" title={tCommon('errorTitle')}>
        {tCommon('errorBody')}
      </Alert>
    );
  }
  if (!pole.data || !live.data) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const info = pole.data;
  const { device, readings, events, schedule } = live.data;
  const number = (value: number | null, digits = 1) =>
    value === null ? '—' : format.number(value, { maximumFractionDigits: digits });
  // Server time can be a few seconds ahead of this tab's clock: never say "in 5 seconds".
  const relative = (iso: string | null) =>
    iso
      ? format.relativeTime(new Date(Math.min(new Date(iso).getTime(), now.getTime())), now)
      : t('never');
  const peak = readings.reduce((max, reading) => Math.max(max, reading.powerW), 0);

  return (
    <>
      <Link
        href="/poles"
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline [&_svg]:size-4"
      >
        <ArrowLeft aria-hidden="true" />
        {t('back')}
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-mono text-2xl font-semibold sm:text-3xl">{info.code}</h1>
          <p className="mt-1 text-muted-foreground">
            {[info.address, info.ward, info.zone?.name].filter(Boolean).join(' · ') ||
              t('noAddress')}
          </p>
        </div>
        <Button asChild variant="secondary">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${info.latitude},${info.longitude}`}
            target="_blank"
            rel="noreferrer"
          >
            <MapPin aria-hidden="true" />
            {tCommon('openInMaps')}
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
      </div>

      {!device ? (
        <EmptyState
          icon={<Cpu />}
          title={t('noController.title')}
          description={t('noController.body')}
          className="min-h-64"
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="grid min-w-0 content-start gap-6 xl:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('now.title')}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
                {/* The pole as it looks right now */}
                <div className="relative flex min-h-56 items-end justify-center overflow-hidden rounded-xl bg-[radial-gradient(120%_100%_at_50%_0%,var(--color-night-soft),var(--color-night))] pt-6">
                  <StreetPole
                    status={STREET_STATUS[info.lightStatus]}
                    dimPercent={device.lampOn ? device.dimPercent : null}
                    size="lg"
                    className="relative z-10 -mb-1"
                  />
                  <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-5 bg-road" />
                </div>
                <div className="grid min-w-0 content-start gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <LightStatusLabel status={info.lightStatus} />
                    <Badge tone={device.online ? 'success' : 'warning'}>
                      {device.online ? t('online') : t('offline')}
                    </Badge>
                    {device.mode ? (
                      <Badge
                        tone={
                          device.mode === 'manual'
                            ? 'info'
                            : device.mode === 'failsafe'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {t(`mode.${device.mode as 'auto'}`)}
                      </Badge>
                    ) : null}
                  </div>
                  <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Reading
                      label={t('readings.lamp')}
                      value={
                        device.lampOn === null
                          ? '—'
                          : device.lampOn
                            ? t('readings.onAt', { value: device.dimPercent ?? 100 })
                            : t('readings.off')
                      }
                    />
                    <Reading label={t('readings.power')} value={`${number(device.powerW)} W`} />
                    <Reading
                      label={t('readings.voltage')}
                      value={`${number(device.voltageV, 0)} V`}
                    />
                    <Reading
                      label={t('readings.current')}
                      value={`${number(device.currentA, 2)} A`}
                    />
                    <Reading
                      label={t('readings.energy')}
                      value={`${number(device.energyWh === null ? null : device.energyWh / 1000, 1)} kWh`}
                    />
                    <Reading
                      label={t('readings.signal')}
                      value={device.rssiDbm === null ? '—' : `${device.rssiDbm} dBm`}
                    />
                    <Reading
                      label={t('readings.temperature')}
                      value={
                        device.boardTempC === null ? '—' : `${number(device.boardTempC, 0)} °C`
                      }
                    />
                    <Reading
                      label={t('readings.lastReport')}
                      value={relative(device.lastTelemetryAt)}
                    />
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    {t('controllerLine', {
                      id: device.deviceId,
                      firmware: device.firmwareVersion ?? '—',
                      network: device.network ?? '—',
                    })}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('power.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                {readings.length < 2 ? (
                  <p className="text-sm text-muted-foreground">{t('power.empty')}</p>
                ) : (
                  <PowerChart
                    readings={readings}
                    label={t('power.label', {
                      peak: format.number(peak, { maximumFractionDigits: 0 }),
                    })}
                    summary={t('power.peak', {
                      peak: format.number(peak, { maximumFractionDigits: 0 }),
                    })}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('events.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('events.empty')}</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {events.map((event) => (
                      <li
                        key={event.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                      >
                        <span className="min-w-0">
                          <span className="font-medium">
                            {event.type === 'fault_cleared'
                              ? t('events.cleared', { fault: faultLabel(event.clears) })
                              : event.type === 'boot'
                                ? t('events.boot')
                                : faultLabel(event.type)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {format.dateTime(new Date(event.receivedAt), {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </span>
                        </span>
                        {event.workOrderId ? (
                          <Link
                            href={`/work-orders/${event.workOrderId}`}
                            className="text-sm font-semibold text-primary hover:underline"
                          >
                            {t('events.workOrder')}
                          </Link>
                        ) : event.resolvedAt === null ? (
                          <Badge tone={event.severity === 'critical' ? 'danger' : 'warning'}>
                            {t('events.open')}
                          </Badge>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid content-start gap-6">
            {CONTROLLERS.has(user.role) ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t('control.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ControlPanel
                    target={{ type: 'pole', poleId: info.id }}
                    onSent={() => {
                      // Now (command list) and again once the controller has had time to
                      // acknowledge and report its new state.
                      const refresh = () => {
                        void queryClient.invalidateQueries({ queryKey: ['pole-live', id] });
                        void queryClient.invalidateQueries({ queryKey: ['pole', id] });
                      };
                      refresh();
                      for (const delay of COMMAND_REFRESH_MS) setTimeout(refresh, delay);
                    }}
                  />
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>{t('schedule.title')}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {schedule ? (
                  <>
                    <p>
                      <span className="font-medium">{schedule.name}</span>{' '}
                      <span className="text-muted-foreground">
                        ({schedule.fromZone ? t('schedule.fromZone') : t('schedule.cityDefault')})
                      </span>
                    </p>
                    <Badge tone={device.scheduleInSync ? 'success' : 'warning'} className="w-fit">
                      {device.scheduleInSync ? t('schedule.inSync') : t('schedule.pending')}
                    </Badge>
                  </>
                ) : (
                  <p className="text-muted-foreground">{t('schedule.none')}</p>
                )}
                <Link href="/schedules" className="font-semibold text-primary hover:underline">
                  {t('schedule.manage')}
                </Link>
              </CardContent>
            </Card>

            <CommandHistory poleId={id} />
          </div>
        </div>
      )}
    </>
  );
}
