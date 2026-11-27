'use client';

import { ApiClientError, type WorkOrderDetailDto } from '@smart-light/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Select,
  Textarea,
} from '@smart-light/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart3, ClipboardList, MapPin, Wrench, Zap } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent, type ReactNode } from 'react';
import { api } from '@/lib/api';

const PRIORITIES = ['NORMAL', 'HIGH', 'CRITICAL', 'LOW'] as const;

function ActionLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="grid min-h-20 place-items-center gap-1 rounded-xl border border-border bg-surface px-2 py-3 text-center text-sm font-medium hover:border-primary/40 hover:bg-primary-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-5 [&_svg]:text-primary"
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </Link>
  );
}

/**
 * Shortcuts from a pole: the map, reports, work orders and, for control-room
 * roles, raising a work order for this pole (the API records it in the audit log).
 */
export function PoleQuickActions({
  poleCode,
  canCreateWorkOrder,
}: {
  poleCode: string;
  canCreateWorkOrder: boolean;
}) {
  const t = useTranslations('Lighting.pole.quick');
  const tPriority = useTranslations('Priority');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('NORMAL');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.request<WorkOrderDetailDto>('/v1/work-orders', {
        method: 'POST',
        body: { poleCode, priority, description: description.trim() || undefined },
      }),
    onSuccess: () => {
      setOpen(false);
      setDescription('');
      void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });

  const errorText =
    create.error instanceof ApiClientError &&
    (create.error.code === 'WORK_ORDER_EXISTS' || create.error.code === 'CONFLICT')
      ? create.error.message
      : t('createFailed');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap aria-hidden="true" className="size-5 text-primary" />
          {t('title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid grid-cols-3 gap-2">
          <ActionLink href="/map" icon={<MapPin />} label={t('map')} />
          <ActionLink href="/reports" icon={<BarChart3 />} label={t('reports')} />
          <ActionLink href="/work-orders" icon={<ClipboardList />} label={t('workOrders')} />
        </div>

        {create.isSuccess && !open ? (
          <Alert tone="success">
            {t('created', { number: create.data.number })}{' '}
            <Link
              href={`/work-orders/${create.data.id}`}
              className="font-semibold underline underline-offset-2"
            >
              {t('openWorkOrder')}
            </Link>
          </Alert>
        ) : null}

        {canCreateWorkOrder ? (
          open ? (
            <form
              onSubmit={onSubmit}
              className="grid gap-3 rounded-xl border border-border p-3"
              aria-busy={create.isPending}
            >
              <p className="font-semibold">{t('createTitle', { code: poleCode })}</p>
              {create.isError ? <Alert tone="danger">{errorText}</Alert> : null}
              <Field label={t('priority')}>
                {({ id }) => (
                  <Select
                    id={id}
                    value={priority}
                    onChange={(event) =>
                      setPriority(event.target.value as (typeof PRIORITIES)[number])
                    }
                  >
                    {PRIORITIES.map((value) => (
                      <option key={value} value={value}>
                        {tPriority(value)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('description')} hint={t('descriptionHint')}>
                {({ id, describedBy }) => (
                  <Textarea
                    id={id}
                    aria-describedby={describedBy}
                    maxLength={1000}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                )}
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? t('creating') : t('create')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={create.isPending}
                  onClick={() => {
                    setOpen(false);
                    create.reset();
                  }}
                >
                  {t('cancel')}
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                create.reset();
                setOpen(true);
              }}
            >
              <Wrench aria-hidden="true" />
              {t('createWorkOrder')}
            </Button>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
