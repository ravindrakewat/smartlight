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
  PageHero,
  Skeleton,
  StreetPole,
  cn,
} from '@smart-light/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  Clock,
  Cpu,
  ExternalLink,
  Gauge,
  Leaf,
  Lightbulb,
  LightbulbOff,
  MapPin,
  Plug,
  RefreshCw,
  Signal,
  Tag,
  Thermometer,
  TriangleAlert,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LightStatusLabel, useFaultLabel } from '@/components/labels';
import { CommandHistory } from '@/components/lighting/CommandHistory';
import { ControlPanel } from '@/components/lighting/ControlPanel';
import { PoleQuickActions } from '@/components/lighting/PoleQuickActions';
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
/** Older readings than this are flagged: the controller may be online but silent. */
const STALE_MS = 15 * 60_000;

type TileTone = 'lamp' | 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

const TILE_TONES: Record<TileTone, string> = {
  lamp: 'bg-warning-subtle text-warning',
  primary: 'bg-primary-subtle text-primary',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  neutral: 'bg-neutral-subtle text-muted-foreground',
};

function ReadingTile({
  label,
  value,
  detail,
  icon,
  tone = 'primary',
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon: ReactNode;
  tone?: TileTone;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-surface p-2.5 shadow-xs sm:gap-3 sm:p-3">
      <span
        aria-hidden="true"
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-full sm:size-10 [&_svg]:size-4 sm:[&_svg]:size-5',
          TILE_TONES[tone],
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-base font-semibold break-words tabular-nums">{value}</dd>
        {detail ? <dd className="text-xs break-words text-muted-foreground">{detail}</dd> : null}
      </div>
    </div>
  );
}

/** Wi-Fi / cellular RSSI in words, so the number is not the only signal. */
function signalQuality(rssi: number | null): 'good' | 'fair' | 'weak' | null {
  if (rssi === null) return null;
  if (rssi >= -67) return 'good';
  if (rssi >= -80) return 'fair';
  return 'weak';
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

  const backLink = (
    <Link
      href="/poles"
      className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary hover:underline [&_svg]:size-4"
    >
      <ArrowLeft aria-hidden="true" />
      {t('back')}
    </Link>
  );

  // Keep showing the last data if a background refresh fails; block only when there is none.
  if ((pole.error && !pole.data) || (live.error && !live.data)) {
    return (
      <>
        {backLink}
        <Alert tone="danger" title={tCommon('errorTitle')}>
          <p>{tCommon('errorBody')}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => {
              void pole.refetch();
              void live.refetch();
            }}
          >
            {tCommon('retry')}
          </Button>
        </Alert>
      </>
    );
  }
  if (!pole.data || !live.data) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          {tCommon('loading')}
        </span>
        <Skeleton className="h-36 rounded-2xl" />
        <div className="grid gap-6 xl:grid-cols-3">
          <Skeleton className="h-80 xl:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const info = pole.data;
  const { device, readings, events, schedule } = live.data;
  const number = (value: number | null, digits = 1) =>
    value === null ? '—' : format.number(value, { maximumFractionDigits: digits });
  // Server time can be a few seconds ahead of this tab's clock: never say "in 5 seconds".
  const relative = (iso: string | null | number) =>
    iso
      ? format.relativeTime(new Date(Math.min(new Date(iso).getTime(), now.getTime())), now)
      : t('never');
  const refreshing = pole.isFetching || live.isFetching;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['pole-live', id] });
    void queryClient.invalidateQueries({ queryKey: ['pole', id] });
  };

  const hero = (
    <PageHero
      eyebrow={t('eyebrow')}
      title={info.code}
      titleClassName="font-mono"
      background={
        <Image
          src="/images/pole-hero.webp"
          alt=""
          fill
          priority
          sizes="(min-width: 1280px) 1100px, 100vw"
          className="object-cover object-center"
        />
      }
      icon={<Lightbulb />}
      description={
        <span className="inline-flex items-start gap-1.5">
          <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {[info.address, info.ward, info.zone?.name].filter(Boolean).join(' · ') || t('noAddress')}
        </span>
      }
      aside={
        <Button asChild className="rounded-full">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${info.latitude},${info.longitude}`}
            target="_blank"
            rel="noreferrer"
          >
            <MapPin aria-hidden="true" />
            {tCommon('openInMaps')}
            <ExternalLink aria-hidden="true" />
            <span className="sr-only">{t('opensNewTab')}</span>
          </a>
        </Button>
      }
    />
  );

  const quickActions = (
    <PoleQuickActions poleCode={info.code} canCreateWorkOrder={CONTROLLERS.has(user.role)} />
  );

  if (!device) {
    return (
      <>
        {backLink}
        {hero}
        <div className="grid gap-6 xl:grid-cols-3">
          <EmptyState
            icon={<Cpu />}
            title={t('noController.title')}
            description={t('noController.body')}
            className="min-h-64 xl:col-span-2"
          />
          {quickActions}
        </div>
      </>
    );
  }

  const lastReportAt = device.lastTelemetryAt ? new Date(device.lastTelemetryAt).getTime() : null;
  const stale = lastReportAt !== null && now.getTime() - lastReportAt > STALE_MS;
  const quality = signalQuality(device.rssiDbm);
  const lampTone: TileTone =
    info.lightStatus === 'FAULT' ? 'danger' : device.lampOn ? 'lamp' : 'neutral';

  return (
    <>
      {backLink}
      {hero}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 xl:col-span-2">
          <Card>
            <CardContent className="grid gap-4 pt-5">
              {/* Status strip: light, connectivity, mode, freshness */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-surface-subtle px-3 py-1">
                    <LightStatusLabel status={info.lightStatus} />
                  </span>
                  <Badge tone={device.online ? 'success' : 'warning'}>
                    {device.online ? (
                      <Wifi aria-hidden="true" className="size-3.5" />
                    ) : (
                      <WifiOff aria-hidden="true" className="size-3.5" />
                    )}
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
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <span role="status">{t('updated', { time: relative(live.dataUpdatedAt) })}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('refresh')}
                    disabled={refreshing}
                    onClick={refresh}
                  >
                    <RefreshCw
                      aria-hidden="true"
                      className={cn(refreshing && 'motion-safe:animate-spin')}
                    />
                  </Button>
                </div>
              </div>

              {!device.online ? (
                <Alert
                  tone="warning"
                  icon={<WifiOff aria-hidden="true" />}
                  title={t('offlineTitle')}
                >
                  {t('offlineBody', { time: relative(device.lastSeenAt) })}
                </Alert>
              ) : stale ? (
                <Alert tone="warning" icon={<Clock aria-hidden="true" />}>
                  {t('staleBody', { time: relative(device.lastTelemetryAt) })}
                </Alert>
              ) : null}
              {live.error || pole.error ? <Alert tone="warning">{t('refreshFailed')}</Alert> : null}

              <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
                {/* The pole as it looks right now */}
                <div className="relative flex min-h-56 items-end justify-center overflow-hidden rounded-2xl bg-[radial-gradient(120%_100%_at_50%_0%,var(--color-night-soft),var(--color-night))] pt-6">
                  <StreetPole
                    status={STREET_STATUS[info.lightStatus]}
                    dimPercent={device.lampOn ? device.dimPercent : null}
                    size="lg"
                    className="relative z-10 -mb-1"
                  />
                  <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-5 bg-road" />
                </div>

                <dl className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 2xl:grid-cols-3">
                  <ReadingTile
                    label={t('readings.lamp')}
                    tone={lampTone}
                    icon={device.lampOn === false ? <LightbulbOff /> : <Lightbulb />}
                    value={
                      device.lampOn === null
                        ? '—'
                        : device.lampOn
                          ? t('readings.onAt', { value: device.dimPercent ?? 100 })
                          : t('readings.off')
                    }
                  />
                  <ReadingTile
                    label={t('readings.power')}
                    icon={<Zap />}
                    value={`${number(device.powerW)} W`}
                  />
                  <ReadingTile
                    label={t('readings.voltage')}
                    tone="success"
                    icon={<Plug />}
                    value={`${number(device.voltageV, 0)} V`}
                  />
                  <ReadingTile
                    label={t('readings.current')}
                    icon={<Gauge />}
                    value={`${number(device.currentA, 2)} A`}
                  />
                  <ReadingTile
                    label={t('readings.energy')}
                    tone="success"
                    icon={<Leaf />}
                    value={`${number(device.energyWh === null ? null : device.energyWh / 1000, 1)} kWh`}
                  />
                  <ReadingTile
                    label={t('readings.signal')}
                    tone={quality === 'weak' ? 'warning' : 'primary'}
                    icon={<Signal />}
                    value={device.rssiDbm === null ? '—' : `${device.rssiDbm} dBm`}
                    detail={
                      quality
                        ? `${t(`signal.${quality}`)} · ${device.network ?? '—'}`
                        : (device.network ?? undefined)
                    }
                  />
                  <ReadingTile
                    label={t('readings.controller')}
                    tone={device.online ? 'success' : 'warning'}
                    icon={device.online ? <Cpu /> : <WifiOff />}
                    value={device.online ? t('readings.online') : t('readings.offline')}
                    detail={t('lastSeen', { time: relative(device.lastSeenAt) })}
                  />
                  <ReadingTile
                    label={t('readings.lastReport')}
                    tone={stale ? 'warning' : 'primary'}
                    icon={<Clock />}
                    value={relative(device.lastTelemetryAt)}
                  />
                  <ReadingTile
                    label={t('readings.boardTemp')}
                    tone="neutral"
                    icon={<Thermometer />}
                    value={device.boardTempC === null ? '—' : `${number(device.boardTempC, 0)} °C`}
                  />
                  <ReadingTile
                    label={t('readings.controllerId')}
                    tone="neutral"
                    icon={<Tag />}
                    value={
                      <span className="font-mono text-sm sm:text-base">{device.deviceId}</span>
                    }
                  />
                  <ReadingTile
                    label={t('readings.firmware')}
                    tone="neutral"
                    icon={<Activity />}
                    value={
                      <span className="font-mono text-sm sm:text-base">
                        {device.firmwareVersion ?? '—'}
                      </span>
                    }
                  />
                </dl>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap aria-hidden="true" className="size-5 text-primary" />
                {t('power.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {readings.length < 2 ? (
                <EmptyState
                  icon={<Activity />}
                  title={t('power.empty')}
                  description={t('power.emptyBody')}
                />
              ) : (
                <PowerChart readings={readings} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TriangleAlert aria-hidden="true" className="size-5 text-primary" />
                {t('events.title')}
              </CardTitle>
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

        <div className="grid min-w-0 content-start gap-6">
          {CONTROLLERS.has(user.role) ? (
            <Card className="border-primary/30 shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Zap aria-hidden="true" className="size-5 text-primary" />
                  {t('control.title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ControlPanel
                  target={{ type: 'pole', poleId: info.id }}
                  reported={{
                    online: device.online,
                    lampOn: device.lampOn,
                    dimPercent: device.dimPercent,
                  }}
                  onSent={() => {
                    // Now (command list) and again once the controller has had time to
                    // acknowledge and report its new state.
                    refresh();
                    for (const delay of COMMAND_REFRESH_MS) setTimeout(refresh, delay);
                  }}
                />
              </CardContent>
            </Card>
          ) : null}

          {quickActions}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock aria-hidden="true" className="size-5 text-primary" />
                {t('schedule.title')}
              </CardTitle>
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
              <Link
                href="/schedules"
                className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
              >
                {t('schedule.manage')}
              </Link>
            </CardContent>
          </Card>

          <CommandHistory poleId={id} />
        </div>
      </div>
    </>
  );
}
