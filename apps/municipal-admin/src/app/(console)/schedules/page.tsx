'use client';

import type { ScheduleDto, ZoneDto } from '@smart-light/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Select,
  Skeleton,
} from '@smart-light/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CalendarClock, Map as MapIcon, MapPinned, Plus, Zap } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ControlPanel } from '@/components/lighting/ControlPanel';
import { ScheduleEditor } from '@/components/lighting/ScheduleEditor';
import {
  ActiveSchedules,
  LightingStatus,
  ScheduleCard,
} from '@/components/lighting/ScheduleOverview';
import { useSessionUser } from '@/components/Session';
import { ConsoleHero } from '@/components/shell/ConsoleHero';
import { api } from '@/lib/api';

const ADMINS = new Set(['SUPER_ADMIN', 'MUNICIPAL_ADMIN']);
const CONTROLLERS = new Set(['SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'SUPERVISOR', 'OPERATOR']);
/** Roles allowed to read the dashboard summary (live counts). */
const STATUS_READERS = new Set([
  'SUPER_ADMIN',
  'MUNICIPAL_ADMIN',
  'SUPERVISOR',
  'OPERATOR',
  'AGENCY_MANAGER',
]);
const LIST_ID = 'all-schedules';

type Notice = { kind: 'saved' | 'created' | 'deleted'; name: string } | null;

export default function SchedulesPage() {
  const t = useTranslations('Lighting.schedules');
  const tCommon = useTranslations('Common');
  const user = useSessionUser();
  const queryClient = useQueryClient();
  const admin = ADMINS.has(user.role);

  const [editing, setEditing] = useState<ScheduleDto | 'new' | null>(null);
  const [overrideTarget, setOverrideTarget] = useState('city');
  const [notice, setNotice] = useState<Notice>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const schedules = useQuery({
    queryKey: ['schedules'],
    queryFn: () => api.request<ScheduleDto[]>('/v1/schedules'),
  });
  const zones = useQuery({
    queryKey: ['zones'],
    queryFn: () => api.request<ZoneDto[]>('/v1/zones'),
  });

  // Bring the editor into view when it opens (it sits above the list).
  useEffect(() => {
    if (editing !== null) editorRef.current?.scrollIntoView({ block: 'start' });
  }, [editing]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['schedules'] });
    void queryClient.invalidateQueries({ queryKey: ['zones'] });
  };

  const remove = useMutation({
    mutationFn: (schedule: ScheduleDto) =>
      api.request(`/v1/schedules/${schedule.id}`, { method: 'DELETE' }),
    onSuccess: (_, schedule) => {
      setNotice({ kind: 'deleted', name: schedule.name });
      refresh();
    },
  });
  const assign = useMutation({
    mutationFn: (input: { zoneId: string; scheduleId: string | null }) =>
      api.request<{ queued: number }>(`/v1/zones/${input.zoneId}/schedule`, {
        method: 'PUT',
        body: { scheduleId: input.scheduleId },
      }),
    onSuccess: refresh,
  });

  const defaultSchedule = schedules.data?.find((schedule) => schedule.isDefault);
  const targetName =
    overrideTarget === 'city'
      ? t('override.city')
      : (zones.data?.find((zone) => zone.id === overrideTarget)?.name ?? '');

  const openEditor = (next: ScheduleDto | 'new') => {
    setNotice(null);
    remove.reset();
    setEditing(next);
  };

  return (
    <>
      <ConsoleHero
        icon={<CalendarClock />}
        title={t('title')}
        description={t('description')}
        actions={
          admin && editing === null ? (
            <Button onClick={() => openEditor('new')}>
              <Plus aria-hidden="true" />
              {t('new')}
            </Button>
          ) : null
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 xl:col-span-2">
          {notice ? (
            <Alert tone="success">{t(`notices.${notice.kind}`, { name: notice.name })}</Alert>
          ) : null}

          {editing !== null ? (
            <div ref={editorRef} className="scroll-mt-24">
              <ScheduleEditor
                key={editing === 'new' ? 'new' : editing.id}
                schedule={editing === 'new' ? null : editing}
                onCancel={() => setEditing(null)}
                onSaved={(saved) => {
                  setNotice({ kind: editing === 'new' ? 'created' : 'saved', name: saved.name });
                  setEditing(null);
                  refresh();
                }}
              />
            </div>
          ) : null}

          <section
            aria-labelledby={`${LIST_ID}-title`}
            id={LIST_ID}
            className="grid scroll-mt-24 gap-4"
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id={`${LIST_ID}-title`} className="text-xl font-semibold">
                  {t('listTitle')}
                </h2>
                <p className="text-sm text-muted-foreground">{t('listDescription')}</p>
              </div>
            </div>

            {schedules.error ? (
              <Alert tone="danger" title={tCommon('errorTitle')}>
                <p>{tCommon('errorBody')}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => void schedules.refetch()}
                >
                  {tCommon('retry')}
                </Button>
              </Alert>
            ) : null}
            {remove.error ? <Alert tone="danger">{t('deleteFailed')}</Alert> : null}

            {schedules.isPending ? (
              <>
                <Skeleton className="h-44" />
                <Skeleton className="h-44" />
              </>
            ) : schedules.data && schedules.data.length === 0 ? (
              <EmptyState
                icon={<CalendarClock />}
                title={t('empty')}
                description={t('emptyBody')}
                action={
                  admin && editing === null ? (
                    <Button onClick={() => openEditor('new')}>
                      <Plus aria-hidden="true" />
                      {t('new')}
                    </Button>
                  ) : null
                }
              />
            ) : (
              schedules.data?.map((schedule) => (
                <ScheduleCard
                  key={schedule.id}
                  schedule={schedule}
                  canEdit={admin}
                  deleting={remove.isPending}
                  onEdit={() => openEditor(schedule)}
                  onDelete={() => {
                    if (window.confirm(t('confirmDelete', { name: schedule.name }))) {
                      setNotice(null);
                      remove.mutate(schedule);
                    }
                  }}
                />
              ))
            )}
          </section>
        </div>

        <div className="grid min-w-0 content-start gap-6">
          <ActiveSchedules
            schedules={schedules.data}
            loading={schedules.isPending}
            listId={LIST_ID}
          />

          {STATUS_READERS.has(user.role) ? <LightingStatus /> : null}

          {CONTROLLERS.has(user.role) ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap aria-hidden="true" className="size-5 text-primary" />
                  {t('override.title')}
                </CardTitle>
                <CardDescription>{t('override.description')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Field label={t('override.target')}>
                  {({ id }) => (
                    <Select
                      id={id}
                      value={overrideTarget}
                      onChange={(event) => setOverrideTarget(event.target.value)}
                    >
                      <option value="city">{t('override.city')}</option>
                      {zones.data?.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {t('override.zone', { code: zone.code, name: zone.name })}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <ControlPanel
                  key={overrideTarget}
                  layout="tiles"
                  target={
                    overrideTarget === 'city'
                      ? { type: 'city' }
                      : { type: 'zone', zoneId: overrideTarget }
                  }
                  confirm={(action) =>
                    window.confirm(t(`override.confirm.${action}`, { target: targetName }))
                  }
                />
                <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                  <Button
                    asChild
                    variant="outline"
                    className="h-auto min-h-11 py-2 whitespace-normal"
                  >
                    <Link href="/map">
                      <MapIcon aria-hidden="true" />
                      {t('override.viewMap')}
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="h-auto min-h-11 py-2 whitespace-normal"
                  >
                    <Link href="/alerts">
                      <Activity aria-hidden="true" />
                      {t('override.checkStatus')}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPinned aria-hidden="true" className="size-5 text-primary" />
                {t('zones.title')}
              </CardTitle>
              <CardDescription>{t('zones.description')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {assign.error ? <Alert tone="danger">{t('zones.failed')}</Alert> : null}
              {assign.data && !assign.isPending ? (
                <Alert tone="success">{t('zones.queued', { count: assign.data.queued })}</Alert>
              ) : null}
              {zones.isPending ? <Skeleton className="h-24" /> : null}
              {zones.error ? <Alert tone="danger">{tCommon('errorBody')}</Alert> : null}
              {zones.data?.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('zones.empty')}</p>
              ) : null}
              {zones.data?.map((zone) => (
                <Field key={zone.id} label={`${zone.code} · ${zone.name}`}>
                  {({ id }) => (
                    <Select
                      id={id}
                      disabled={!admin || assign.isPending}
                      value={zone.scheduleId ?? ''}
                      onChange={(event) =>
                        assign.mutate({ zoneId: zone.id, scheduleId: event.target.value || null })
                      }
                    >
                      <option value="">
                        {defaultSchedule
                          ? t('zones.useDefault', { name: defaultSchedule.name })
                          : t('zones.noDefault')}
                      </option>
                      {schedules.data
                        ?.filter((schedule) => !schedule.isDefault)
                        .map((schedule) => (
                          <option key={schedule.id} value={schedule.id}>
                            {schedule.name}
                          </option>
                        ))}
                    </Select>
                  )}
                </Field>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
