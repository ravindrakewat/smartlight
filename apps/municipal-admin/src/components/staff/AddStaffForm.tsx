'use client';

import { ApiClientError, type AgencyDto, type StaffUserDto } from '@smart-light/shared';
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { AGENCY_ROLES, creatableRoles, type ManageableRole } from '@/lib/staff-permissions';
import { useSessionUser } from '../Session';

const KNOWN_ERRORS = new Set(['CONFLICT', 'VALIDATION_ERROR', 'AGENCY_REQUIRED', 'INVALID_AGENCY']);

export function AddStaffForm() {
  const t = useTranslations('Staff.add');
  const tRoles = useTranslations('Common.roles');
  const user = useSessionUser();
  const queryClient = useQueryClient();
  const roles = creatableRoles(user);
  const ownAgencyOnly = user.role === 'AGENCY_MANAGER';

  const empty = {
    role: roles.includes('TECHNICIAN')
      ? ('TECHNICIAN' as ManageableRole)
      : (roles[0] ?? 'TECHNICIAN'),
    agencyId: ownAgencyOnly ? (user.agency?.id ?? '') : '',
    name: '',
    email: '',
    phone: '',
    password: '',
  };
  const [form, setForm] = useState(empty);
  const [created, setCreated] = useState<string | null>(null);
  const needsAgency = AGENCY_ROLES.has(form.role);

  const agencies = useQuery({
    queryKey: ['agencies'],
    queryFn: () => api.request<AgencyDto[]>('/v1/agencies'),
    enabled: roles.length > 0,
  });

  const create = useMutation({
    mutationFn: () => {
      const digits = form.phone.replace(/\D/g, '').slice(-10);
      return api.request<StaffUserDto>('/v1/users', {
        method: 'POST',
        body: {
          role: form.role,
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          ...(needsAgency ? { agencyId: form.agencyId } : {}),
          ...(digits ? { phone: `+91${digits}` } : {}),
        },
      });
    },
    onSuccess: (staff) => {
      setCreated(staff.email);
      setForm(empty);
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
      void queryClient.invalidateQueries({ queryKey: ['agencies'] });
    },
  });

  if (roles.length === 0) {
    return null;
  }

  const errorCode =
    create.error instanceof ApiClientError && KNOWN_ERRORS.has(create.error.code)
      ? create.error.code
      : 'generic';
  const update = (key: keyof typeof empty) => (event: { target: { value: string } }) =>
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
        <form className="grid gap-4" onSubmit={onSubmit}>
          {create.error ? (
            <Alert tone="danger">{t(`errors.${errorCode as 'generic'}`)}</Alert>
          ) : null}
          {created ? <Alert tone="success">{t('created', { email: created })}</Alert> : null}
          <Field label={t('role')} required>
            {({ id }) => (
              <Select id={id} value={form.role} onChange={update('role')}>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {tRoles(role)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {needsAgency ? (
            <Field label={t('agency')} hint={t('agencyHint')} required>
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  required
                  aria-describedby={describedBy}
                  disabled={ownAgencyOnly}
                  value={form.agencyId}
                  onChange={update('agencyId')}
                >
                  <option value="" disabled>
                    {t('chooseAgency')}
                  </option>
                  {(agencies.data ?? [])
                    .filter((agency) => agency.active)
                    .map((agency) => (
                      <option key={agency.id} value={agency.id}>
                        {agency.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          ) : null}
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
      </CardContent>
    </Card>
  );
}
