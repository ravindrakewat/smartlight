'use client';

import { ApiClientError, type ZoneDto } from '@smart-light/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Skeleton,
} from '@smart-light/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useSessionUser } from './Session';

const ZONE_ADMINS = new Set(['MUNICIPAL_ADMIN', 'SUPER_ADMIN']);

/** Zones of the city; their codes are used in the import file's "zone" column. */
export function ZonesCard() {
  const t = useTranslations('PoleImport.zones');
  const tCommon = useTranslations('Common');
  const format = useFormatter();
  const user = useSessionUser();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ code: '', name: '' });

  const zones = useQuery({
    queryKey: ['zones'],
    queryFn: () => api.request<ZoneDto[]>('/v1/zones'),
  });

  const create = useMutation({
    mutationFn: () =>
      api.request<ZoneDto>('/v1/zones', {
        method: 'POST',
        body: { code: form.code.trim().toUpperCase(), name: form.name.trim() },
      }),
    onSuccess: () => {
      setForm({ code: '', name: '' });
      void queryClient.invalidateQueries({ queryKey: ['zones'] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  const errorKey =
    create.error instanceof ApiClientError && create.error.code === 'CONFLICT'
      ? 'exists'
      : 'generic';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {zones.isPending ? (
          <Skeleton className="h-20" />
        ) : zones.error ? (
          <Alert tone="danger">{tCommon('errorBody')}</Alert>
        ) : zones.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {zones.data.map((zone) => (
              <li key={zone.id} className="flex items-baseline justify-between gap-3 py-2">
                <span>
                  <span className="font-mono font-semibold">{zone.code}</span> · {zone.name}
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {t('poleCount', {
                    count: zone.poleCount,
                    formatted: format.number(zone.poleCount),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}

        {ZONE_ADMINS.has(user.role) ? (
          <form className="grid gap-3 border-t border-border pt-4" onSubmit={onSubmit}>
            {create.error ? <Alert tone="danger">{t(`errors.${errorKey}`)}</Alert> : null}
            <div className="grid grid-cols-[6rem_1fr] gap-3">
              <Field label={t('code')} required>
                {({ id }) => (
                  <Input
                    id={id}
                    required
                    maxLength={10}
                    pattern="[A-Za-z0-9-]{1,10}"
                    className="font-mono uppercase"
                    value={form.code}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, code: event.target.value }))
                    }
                  />
                )}
              </Field>
              <Field label={t('name')} required>
                {({ id }) => (
                  <Input
                    id={id}
                    required
                    minLength={2}
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                )}
              </Field>
            </div>
            <Button type="submit" variant="secondary" disabled={create.isPending}>
              {t('add')}
            </Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">{t('adminOnly')}</p>
        )}
      </CardContent>
    </Card>
  );
}
