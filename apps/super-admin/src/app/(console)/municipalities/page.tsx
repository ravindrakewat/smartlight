'use client';

import { ApiClientError, type TenantDto } from '@smart-light/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Skeleton,
} from '@smart-light/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { TenantsTable } from '@/components/TenantsTable';
import { api } from '@/lib/api';

const EMPTY_FORM = { name: '', nameHi: '', slug: '', code: '', slaHours: '24' };
const KNOWN_ERRORS = new Set(['CONFLICT', 'VALIDATION_ERROR']);

export default function MunicipalitiesPage() {
  const t = useTranslations('Municipalities');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [created, setCreated] = useState<string | null>(null);

  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.request<TenantDto[]>('/v1/tenants'),
  });

  const errorText = (error: unknown) =>
    t(
      `errors.${(error instanceof ApiClientError && KNOWN_ERRORS.has(error.code) ? error.code : 'generic') as 'generic'}`,
    );

  const create = useMutation({
    mutationFn: () =>
      api.request<TenantDto>('/v1/tenants', {
        method: 'POST',
        body: {
          name: form.name,
          nameHi: form.nameHi,
          slug: form.slug.trim().toLowerCase(),
          code: form.code.trim().toUpperCase(),
          slaHours: Number(form.slaHours),
        },
      }),
    onSuccess: (tenant) => {
      setCreated(locale === 'hi' ? tenant.nameHi : tenant.name);
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
  });

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: TenantDto['status'] }) =>
      api.request<TenantDto>(`/v1/tenants/${input.id}`, {
        method: 'PATCH',
        body: { status: input.status },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tenants'] }),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setCreated(null);
    create.mutate();
  }

  const update = (key: keyof typeof EMPTY_FORM) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardContent className="pt-5">
            {setStatus.error ? (
              <Alert tone="danger" className="mb-4">
                {errorText(setStatus.error)}
              </Alert>
            ) : null}
            {tenants.data ? (
              <TenantsTable
                tenants={tenants.data}
                actions={(tenant) =>
                  tenant.status === 'SUSPENDED' || tenant.status === 'ONBOARDING' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: tenant.id, status: 'ACTIVE' })}
                    >
                      {t('actions.activate')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: tenant.id, status: 'SUSPENDED' })}
                    >
                      {t('actions.suspend')}
                    </Button>
                  )
                }
              />
            ) : tenants.error ? (
              <Alert tone="danger" title={tCommon('errorTitle')}>
                {tCommon('errorBody')}
              </Alert>
            ) : (
              <Skeleton className="h-40" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('form.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={onSubmit}>
              {create.error ? <Alert tone="danger">{errorText(create.error)}</Alert> : null}
              {created ? (
                <Alert tone="success">{t('form.created', { name: created })}</Alert>
              ) : null}
              <Field label={t('form.name')} required>
                {({ id }) => (
                  <Input
                    id={id}
                    required
                    minLength={3}
                    value={form.name}
                    onChange={update('name')}
                  />
                )}
              </Field>
              <Field label={t('form.nameHi')} required>
                {({ id }) => (
                  <Input
                    id={id}
                    lang="hi"
                    required
                    minLength={2}
                    value={form.nameHi}
                    onChange={update('nameHi')}
                  />
                )}
              </Field>
              <Field label={t('form.slug')} hint={t('form.slugHint')} required>
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    required
                    pattern="[a-z0-9][a-z0-9-]{1,62}"
                    className="font-mono"
                    value={form.slug}
                    onChange={update('slug')}
                  />
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('form.code')} hint={t('form.codeHint')} required>
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      required
                      maxLength={3}
                      pattern="[A-Za-z]{3}"
                      className="font-mono uppercase"
                      value={form.code}
                      onChange={update('code')}
                    />
                  )}
                </Field>
                <Field label={t('form.slaHours')} required>
                  {({ id }) => (
                    <Input
                      id={id}
                      type="number"
                      min={1}
                      max={168}
                      required
                      value={form.slaHours}
                      onChange={update('slaHours')}
                    />
                  )}
                </Field>
              </div>
              <Button type="submit" disabled={create.isPending}>
                {t('form.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
