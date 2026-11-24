'use client';

import { ApiClientError } from '@smart-light/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChangePasswordForm,
} from '@smart-light/ui';
import { Settings as SettingsIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useSessionUser } from '@/components/Session';
import { api } from '@/lib/api';
import { ConsoleHero } from '@/components/shell/ConsoleHero';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

export default function SettingsPage() {
  const t = useTranslations('Settings');
  const tRoles = useTranslations('Common.roles');
  const locale = useLocale();
  const user = useSessionUser();

  async function changePassword(currentPassword: string, newPassword: string) {
    try {
      await api.request('/v1/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      return null;
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'INVALID_CURRENT_PASSWORD') {
        return t('password.wrongCurrent');
      }
      if (error instanceof ApiClientError && error.code === 'VALIDATION_ERROR') {
        return t('password.weak');
      }
      if (error instanceof ApiClientError && error.code === 'TOO_MANY_REQUESTS') {
        return t('password.tooMany');
      }
      return t('password.failed');
    }
  }

  return (
    <>
      <ConsoleHero icon={<SettingsIcon />} title={t('title')} description={t('description')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('account.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3">
              <Row label={t('account.name')}>{user.name}</Row>
              <Row label={t('account.email')}>{user.email}</Row>
              <Row label={t('account.role')}>{tRoles(user.role)}</Row>
              {user.tenant ? (
                <Row label={t('account.organisation')}>
                  {locale === 'hi' ? user.tenant.nameHi : user.tenant.name}
                  {user.agency ? ` · ${user.agency.name}` : ''}
                </Row>
              ) : null}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('password.title')}</CardTitle>
            <CardDescription>{t('password.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm
              onSubmit={changePassword}
              labels={{
                current: t('password.current'),
                next: t('password.next'),
                nextHint: t('password.nextHint'),
                repeat: t('password.repeat'),
                mismatch: t('password.mismatch'),
                submit: t('password.submit'),
                success: t('password.success'),
              }}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
