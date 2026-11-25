'use client';

import {
  ApiClientError,
  REPAIR_CHECKLIST,
  type StaffUserDto,
  type WorkOrderDetailDto,
  type WorkOrderPhotoDto,
} from '@smart-light/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Select,
  Skeleton,
  Textarea,
} from '@smart-light/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleCheck, CircleMinus, ExternalLink, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import {
  DeadlineLabel,
  LightStatusLabel,
  PriorityBadge,
  useFaultLabel,
  WorkOrderStatusBadge,
} from '@/components/labels';
import { useSessionUser } from '@/components/Session';
import { api } from '@/lib/api';
import { municipalEnv } from '@/lib/env';

const DISPATCHERS = new Set(['MUNICIPAL_ADMIN', 'SUPERVISOR', 'AGENCY_MANAGER']);
const VERIFIERS = new Set(['MUNICIPAL_ADMIN', 'SUPERVISOR']);

/** Before / after photos with GPS; links are signed by the API and expire in 10 minutes. */
function RepairPhotos({ workOrderId }: { workOrderId: string }) {
  const t = useTranslations('WorkOrders.detail');
  const format = useFormatter();
  const photos = useQuery({
    queryKey: ['work-order', workOrderId, 'photos'],
    queryFn: () => api.request<WorkOrderPhotoDto[]>(`/v1/work-orders/${workOrderId}/photos`),
    staleTime: 5 * 60_000,
    refetchInterval: 8 * 60_000,
  });
  const items = photos.data ?? [];
  if (photos.isLoading) return <Skeleton className="h-40" />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('photos')}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noPhotos')}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {(['BEFORE', 'AFTER'] as const).map((kind) => (
              <section key={kind}>
                <h3 className="mb-2 text-sm font-semibold">
                  {kind === 'BEFORE' ? t('photoBefore') : t('photoAfter')}
                </h3>
                <ul className="grid grid-cols-2 gap-2">
                  {items
                    .filter((photo) => photo.kind === kind)
                    .map((photo) => (
                      <li key={photo.id}>
                        <a
                          href={`${municipalEnv.NEXT_PUBLIC_API_BASE_URL}${photo.url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded-lg border border-border"
                        >
                          {/* Signed, short-lived API link; next/image would cache it past expiry. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`${municipalEnv.NEXT_PUBLIC_API_BASE_URL}${photo.url}`}
                            alt={t('photoAlt', {
                              kind: kind === 'BEFORE' ? t('photoBefore') : t('photoAfter'),
                              at: format.dateTime(new Date(photo.takenAt), {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              }),
                            })}
                            className="aspect-[4/3] w-full object-cover"
                            loading="lazy"
                          />
                        </a>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {format.dateTime(new Date(photo.takenAt), {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                          {photo.latitude !== null ? ` · ${t('photoGps')}` : ''}
                        </p>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('WorkOrders.detail');
  const tWo = useTranslations('WorkOrders');
  const tCommon = useTranslations('Common');
  const tSource = useTranslations('Source');
  const tEvent = useTranslations('Event');
  const tResolution = useTranslations('Resolution');
  const tChecklist = useTranslations('Checklist');
  const format = useFormatter();
  const faultLabel = useFaultLabel();
  const user = useSessionUser();
  const queryClient = useQueryClient();

  const [technicianId, setTechnicianId] = useState('');
  const [note, setNote] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  const workOrder = useQuery({
    queryKey: ['work-order', id],
    queryFn: () => api.request<WorkOrderDetailDto>(`/v1/work-orders/${id}`),
    refetchInterval: 30_000,
  });
  const canDispatch = DISPATCHERS.has(user.role);
  const technicians = useQuery({
    queryKey: ['technicians'],
    queryFn: () =>
      api.page<StaffUserDto>('/v1/users', {
        query: { role: 'TECHNICIAN', status: 'ACTIVE', pageSize: 100 },
      }),
    enabled: canDispatch,
    staleTime: 5 * 60_000,
  });

  const action = useMutation({
    mutationFn: (input: { path: string; body: unknown }) =>
      api.request<WorkOrderDetailDto>(`/v1/work-orders/${id}/${input.path}`, {
        method: 'POST',
        body: input.body,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['work-order', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setNote('');
      setShowCancel(false);
    },
  });

  if (workOrder.isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (workOrder.error || !workOrder.data) {
    return (
      <Alert tone="danger" title={tCommon('errorTitle')}>
        {tCommon('errorBody')}
      </Alert>
    );
  }

  const wo = workOrder.data;
  const isOpen = !['RESOLVED', 'CANCELLED'].includes(wo.status);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${wo.pole.latitude},${wo.pole.longitude}`;
  const actionError =
    action.error instanceof ApiClientError
      ? action.error.message
      : action.error
        ? tCommon('errorBody')
        : null;
  const dateTime = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <>
      <Link
        href="/work-orders"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t('back')}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">
            {faultLabel(wo.faultType)} · <span className="font-mono">{wo.pole.code}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{wo.number}</span>
            <WorkOrderStatusBadge status={wo.status} />
            <PriorityBadge priority={wo.priority} />
            {isOpen ? <DeadlineLabel dueAt={wo.slaDueAt} overdue={wo.overdue} /> : null}
          </div>
        </div>
        <Button asChild variant="outline">
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <MapPin />
            {tCommon('openInMaps')}
            <ExternalLink />
          </a>
        </Button>
      </div>

      {actionError ? (
        <Alert tone="danger" className="mb-4">
          {actionError}
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid gap-6 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('summary')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label={t('pole')}>
                  <span className="font-mono">{wo.pole.code}</span> ·{' '}
                  <LightStatusLabel status={wo.pole.lightStatus} />
                </Detail>
                <Detail label={t('zone')}>{wo.pole.zoneName ?? '—'}</Detail>
                <Detail label={t('address')}>{wo.pole.address ?? '—'}</Detail>
                <Detail label={t('source')}>
                  {tSource(wo.source)}
                  {wo.complaintCount > 0
                    ? ` · ${tWo('complaints', { count: wo.complaintCount })}`
                    : ''}
                </Detail>
                <Detail label={t('created')}>{dateTime(wo.createdAt)}</Detail>
                <Detail label={t('deadline')}>{dateTime(wo.slaDueAt)}</Detail>
                <Detail label={t('agency')}>{wo.agency?.name ?? '—'}</Detail>
                <Detail label={tWo('columns.technician')}>
                  {wo.technician?.name ?? tWo('unassigned')}
                </Detail>
                <Detail label={t('controller')}>
                  {wo.pole.hasController ? t('hasController') : t('noController')}
                </Detail>
                {wo.resolutionCode ? (
                  <Detail label={t('resolution')}>
                    {tResolution(wo.resolutionCode)}
                    {wo.resolutionNotes ? ` — ${wo.resolutionNotes}` : ''}
                  </Detail>
                ) : null}
              </dl>
              {wo.description ? (
                <p className="mt-4 rounded-lg bg-surface-subtle p-3">{wo.description}</p>
              ) : null}
              {wo.completedAt ? (
                <div className="mt-5 grid gap-5 border-t border-border pt-4 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">{t('checklist')}</h3>
                    <ul className="grid gap-1.5 text-sm">
                      {REPAIR_CHECKLIST.map((item) => {
                        const done = wo.checklist.includes(item);
                        return (
                          <li key={item} className="flex items-center gap-2">
                            {done ? (
                              <CircleCheck aria-hidden="true" className="size-4 text-success" />
                            ) : (
                              <CircleMinus
                                aria-hidden="true"
                                className="size-4 text-muted-foreground"
                              />
                            )}
                            <span className={done ? undefined : 'text-muted-foreground'}>
                              {tChecklist(item)}
                              <span className="sr-only">
                                {' '}
                                ({done ? t('checklistDone') : t('checklistNotDone')})
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">{t('partsUsed')}</h3>
                    {wo.parts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('noParts')}</p>
                    ) : (
                      <ul className="grid gap-1.5 text-sm">
                        {wo.parts.map((part) => (
                          <li key={part.id} className="flex justify-between gap-3">
                            <span>
                              {part.name}{' '}
                              <span className="font-mono text-xs text-muted-foreground">
                                {part.code}
                              </span>
                            </span>
                            <span className="tabular-nums font-medium">
                              {part.quantity} {part.unit}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <RepairPhotos workOrderId={wo.id} />

          <Card>
            <CardHeader>
              <CardTitle>{t('timeline')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative grid gap-5 border-l-2 border-border pl-5">
                {wo.events.map((event) => (
                  <li key={event.id} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute top-1.5 -left-[1.6rem] size-3 rounded-full border-2 border-surface bg-primary"
                    />
                    <p className="font-medium">{tEvent(event.type)}</p>
                    <p className="text-sm text-muted-foreground">
                      {dateTime(event.createdAt)}
                      {event.actorName ? ` · ${event.actorName}` : ''}
                    </p>
                    {event.note ? <p className="mt-1 text-sm">{event.note}</p> : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          {canDispatch && ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(wo.status) ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('assign.title')}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Field label={t('assign.technician')}>
                  {({ id: fieldId }) => (
                    <Select
                      id={fieldId}
                      value={technicianId || wo.technician?.id || ''}
                      onChange={(event) => setTechnicianId(event.target.value)}
                    >
                      <option value="" disabled>
                        {t('assign.choose')}
                      </option>
                      {technicians.data?.items.map((tech) => (
                        <option key={tech.id} value={tech.id}>
                          {tech.name}
                          {tech.agency ? ` — ${tech.agency.name}` : ''}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Button
                  disabled={!technicianId || technicianId === wo.technician?.id || action.isPending}
                  onClick={() => action.mutate({ path: 'assign', body: { technicianId } })}
                >
                  {t('assign.submit')}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {wo.status === 'PENDING_VERIFICATION' && VERIFIERS.has(user.role) ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('verify.title')}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <p className="text-sm text-muted-foreground">
                  {wo.pole.hasController ? t('verify.waitingIot') : t('verify.body')}
                </p>
                <Field label={t('verify.note')}>
                  {({ id: fieldId }) => (
                    <Textarea
                      id={fieldId}
                      value={note}
                      maxLength={500}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  )}
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({
                        path: 'verify',
                        body: { approved: true, note: note || undefined },
                      })
                    }
                  >
                    {t('verify.approve')}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({
                        path: 'verify',
                        body: { approved: false, note: note || undefined },
                      })
                    }
                  >
                    {t('verify.reject')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {isOpen && VERIFIERS.has(user.role) ? (
            showCancel ? (
              <Card>
                <CardContent className="grid gap-3 pt-5">
                  <Field label={t('cancel.reason')} required>
                    {({ id: fieldId }) => (
                      <Textarea
                        id={fieldId}
                        value={cancelReason}
                        maxLength={500}
                        onChange={(event) => setCancelReason(event.target.value)}
                      />
                    )}
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="danger"
                      disabled={cancelReason.trim().length < 5 || action.isPending}
                      onClick={() =>
                        action.mutate({ path: 'cancel', body: { reason: cancelReason } })
                      }
                    >
                      {t('cancel.confirm')}
                    </Button>
                    <Button variant="outline" onClick={() => setShowCancel(false)}>
                      {t('cancel.keep')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Button variant="ghost" className="text-danger" onClick={() => setShowCancel(true)}>
                {t('cancel.button')}
              </Button>
            )
          ) : null}
        </div>
      </div>
    </>
  );
}
