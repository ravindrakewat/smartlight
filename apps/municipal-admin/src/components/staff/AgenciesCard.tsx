'use client';

import { ApiClientError, type AgencyDto } from '@smart-light/shared';
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
  Input,
  Select,
  Skeleton,
} from '@smart-light/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { isAdmin } from '@/lib/staff-permissions';
import { useSessionUser } from '../Session';

const EMPTY = { name: '', type: 'CONTRACTOR' as AgencyDto['type'], contactPhone: '' };

/** Municipal departments and contractor agencies that technicians belong to. */
export function AgenciesCard() {
  const t = useTranslations('Staff.agencies');
  const tCommon = useTranslations('Common');
  const user = useSessionUser();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const admin = isAdmin(user);

  const agencies = useQuery({
    queryKey: ['agencies'],
    queryFn: () => api.request<AgencyDto[]>('/v1/agencies'),
  });

  const create = useMutation({
    mutationFn: () => {
      const digits = form.contactPhone.replace(/\D/g, '').slice(-10);
      return api.request<AgencyDto>('/v1/agencies', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          type: form.type,
          ...(digits ? { contactPhone: `+91${digits}` } : {}),
        },
      });
    },
    onSuccess: () => {
      setForm(EMPTY);
      void queryClient.invalidateQueries({ queryKey: ['agencies'] });
    },
  });

  const toggle = useMutation({
    mutationFn: (agency: AgencyDto) =>
      api.request<AgencyDto>(`/v1/agencies/${agency.id}`, {
        method: 'PATCH',
        body: { active: !agency.active },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['agencies'] }),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  const createError =
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
        {agencies.isPending ? (
          <Skeleton className="h-24" />
        ) : agencies.error ? (
          <Alert tone="danger">{tCommon('errorBody')}</Alert>
        ) : agencies.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {agencies.data.map((agency) => (
              <li key={agency.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{agency.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`types.${agency.type}`)} ·{' '}
                    {t('technicians', { count: agency.technicianCount })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {agency.active ? null : <Badge tone="neutral">{t('inactive')}</Badge>}
                  {admin ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate(agency)}
                    >
                      {agency.active ? t('deactivate') : t('activate')}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {toggle.error ? <Alert tone="danger">{t('errors.generic')}</Alert> : null}

        {admin ? (
          <form className="grid gap-3 border-t border-border pt-4" onSubmit={onSubmit}>
            <p className="text-sm font-semibold">{t('add')}</p>
            {create.error ? <Alert tone="danger">{t(`errors.${createError}`)}</Alert> : null}
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
            <div className="grid gap-3">
              <Field label={t('type')} required>
                {({ id }) => (
                  <Select
                    id={id}
                    value={form.type}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        type: event.target.value as AgencyDto['type'],
                      }))
                    }
                  >
                    <option value="CONTRACTOR">{t('types.CONTRACTOR')}</option>
                    <option value="MUNICIPAL">{t('types.MUNICIPAL')}</option>
                  </Select>
                )}
              </Field>
              <Field label={t('phone')}>
                {({ id }) => (
                  <Input
                    id={id}
                    type="tel"
                    inputMode="numeric"
                    pattern="(\+?91)?[6-9][0-9]{9}"
                    value={form.contactPhone}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, contactPhone: event.target.value }))
                    }
                  />
                )}
              </Field>
            </div>
            <Button type="submit" variant="secondary" disabled={create.isPending}>
              {t('submit')}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
