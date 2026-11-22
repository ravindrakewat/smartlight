'use client';

import { ApiClientError, type StaffUserDto, type TenantDto } from '@smart-light/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
} from '@smart-light/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

const EMPTY_FORM = { tenantId: '', name: '', email: '', phone: '', password: '' };
const KNOWN_ERRORS = new Set(['CONFLICT', 'VALIDATION_ERROR']);

/**
 * Creates the first MUNICIPAL_ADMIN of a municipality. That administrator then
 * signs in to the municipal console and adds their own staff and agencies.
 */
export function AddAdminForm({ tenants }: { tenants: TenantDto[] }) {
  const t = useTranslations('Municipalities.admin');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [created, setCreated] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      const digits = form.phone.replace(/\D/g, '').slice(-10);
      return api.request<StaffUserDto>('/v1/users', {
        method: 'POST',
        body: {
          tenantId: form.tenantId,
          role: 'MUNICIPAL_ADMIN',
          name: form.name.trim(),
          email: form.email.trim(),
          ...(digits ? { phone: `+91${digits}` } : {}),
          password: form.password,
        },
      });
    },
    onSuccess: (user) => {
      setCreated(user.email);
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
  });

  const errorCode =
    create.error instanceof ApiClientError && KNOWN_ERRORS.has(create.error.code)
      ? create.error.code
      : 'generic';

  const update = (key: keyof typeof EMPTY_FORM) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setCreated(null);
    create.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {tenants.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noTenants')}</p>
        ) : (
          <form className="grid gap-4" onSubmit={onSubmit}>
            {create.error ? (
              <Alert tone="danger">{t(`errors.${errorCode as 'generic'}`)}</Alert>
            ) : null}
            {created ? <Alert tone="success">{t('created', { email: created })}</Alert> : null}
            <Field label={t('tenant')} required>
              {({ id }) => (
                <Select id={id} required value={form.tenantId} onChange={update('tenantId')}>
                  <option value="" disabled>
                    {t('chooseTenant')}
                  </option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {locale === 'hi' ? tenant.nameHi : tenant.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('name')} required>
              {({ id }) => (
                <Input
                  id={id}
                  required
                  minLength={2}
                  autoComplete="off"
                  value={form.name}
                  onChange={update('name')}
                />
              )}
            </Field>
            <Field label={t('email')} hint={t('emailHint')} required>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="email"
                  required
                  autoComplete="off"
                  aria-describedby={describedBy}
                  value={form.email}
                  onChange={update('email')}
                />
              )}
            </Field>
            <Field label={t('phone')} hint={t('phoneHint')}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="tel"
                  inputMode="numeric"
                  pattern="(\+?91)?[6-9][0-9]{9}"
                  autoComplete="off"
                  aria-describedby={describedBy}
                  value={form.phone}
                  onChange={update('phone')}
                />
              )}
            </Field>
            <Field label={t('password')} hint={t('passwordHint')} required>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="password"
                  required
                  minLength={10}
                  pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{10,128}"
                  autoComplete="new-password"
                  aria-describedby={describedBy}
                  value={form.password}
                  onChange={update('password')}
                />
              )}
            </Field>
            <Button type="submit" disabled={create.isPending}>
              {t('submit')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
