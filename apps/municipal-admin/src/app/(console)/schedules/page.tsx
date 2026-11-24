'use client';

import { compareScheduleSteps, type ScheduleDto, type ZoneDto } from '@smart-light/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Select,
  Skeleton,
} from '@smart-light/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ControlPanel } from '@/components/lighting/ControlPanel';
import { ScheduleEditor, useStepLabel } from '@/components/lighting/ScheduleEditor';
import { useSessionUser } from '@/components/Session';
import { api } from '@/lib/api';
import { ConsoleHero } from '@/components/shell/ConsoleHero';

const ADMINS = new Set(['SUPER_ADMIN', 'MUNICIPAL_ADMIN']);
const CONTROLLERS = new Set(['SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'SUPERVISOR', 'OPERATOR']);

export default function SchedulesPage() {
  const t = useTranslations('Lighting.schedules');
  const tCommon = useTranslations('Common');
  const stepLabel = useStepLabel();
  const user = useSessionUser();
  const queryClient = useQueryClient();
  const admin = ADMINS.has(user.role);

  const [editing, setEditing] = useState<ScheduleDto | 'new' | null>(null);
  const [overrideTarget, setOverrideTarget] = useState('city');

  const schedules = useQuery({
    queryKey: ['schedules'],
    queryFn: () => api.request<ScheduleDto[]>('/v1/schedules'),
  });
  const zones = useQuery({
    queryKey: ['zones'],
    queryFn: () => api.request<ZoneDto[]>('/v1/zones'),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['schedules'] });
    void queryClient.invalidateQueries({ queryKey: ['zones'] });
  };

  const remove = useMutation({
    mutationFn: (id: string) => api.request(`/v1/schedules/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
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

  return (
    <>
      <ConsoleHero
        icon={<CalendarClock />}
        title={t('title')}
        description={t('description')}
        actions={
          admin && editing === null ? (
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden="true" />
              {t('new')}
            </Button>
          ) : null
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 xl:col-span-2">
          {editing !== null ? (
            <ScheduleEditor
              key={editing === 'new' ? 'new' : editing.id}
              schedule={editing === 'new' ? null : editing}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                refresh();
              }}
            />
          ) : null}

          {schedules.error ? (
            <Alert tone="danger" title={tCommon('errorTitle')}>
              {tCommon('errorBody')}
            </Alert>
          ) : null}
          {remove.error ? <Alert tone="danger">{t('deleteFailed')}</Alert> : null}

          {schedules.isPending ? (
            <Skeleton className="h-48" />
          ) : schedules.data && schedules.data.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-start gap-3 pt-5">
                <CalendarClock aria-hidden="true" className="size-8 text-muted-foreground" />
                <p className="font-medium">{t('empty')}</p>
                <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
              </CardContent>
            </Card>
          ) : (
            schedules.data?.map((schedule) => (
              <Card key={schedule.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>{schedule.name}</CardTitle>
                      <CardDescription>
                        {schedule.isDefault
                          ? t('usedByDefault')
                          : schedule.zones.length > 0
                            ? t('usedByZones', {
                                zones: schedule.zones.map((zone) => zone.code).join(', '),
                              })
                            : t('unused')}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {schedule.isDefault ? <Badge tone="info">{t('default')}</Badge> : null}
                      {admin ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(schedule)}>
                            {t('edit')}
                          </Button>
                          {!schedule.isDefault ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger"
                              disabled={remove.isPending}
                              onClick={() => {
                                if (window.confirm(t('confirmDelete', { name: schedule.name }))) {
                                  remove.mutate(schedule.id);
                                }
                              }}
                            >
                              {t('delete')}
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ol className="grid gap-1.5 text-sm">
                    {[...schedule.steps].sort(compareScheduleSteps).map((step, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={`size-2.5 shrink-0 rounded-full ${step.on ? 'bg-brand' : 'bg-muted-foreground/40'}`}
                        />
                        {stepLabel(step)}
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="grid content-start gap-6">
          {CONTROLLERS.has(user.role) ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('override.title')}</CardTitle>
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
                  target={
                    overrideTarget === 'city'
                      ? { type: 'city' }
                      : { type: 'zone', zoneId: overrideTarget }
                  }
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t('zones.title')}</CardTitle>
              <CardDescription>{t('zones.description')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {assign.error ? <Alert tone="danger">{t('zones.failed')}</Alert> : null}
              {assign.data && !assign.isPending ? (
                <Alert tone="success">{t('zones.queued', { count: assign.data.queued })}</Alert>
              ) : null}
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
