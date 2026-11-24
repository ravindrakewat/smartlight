'use client';

import {
  ApiClientError,
  type MfaSetupResponse,
  type MfaStatus,
  type SessionInfo,
} from '@smart-light/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SessionsList,
  Skeleton,
  TwoFactorSettings,
} from '@smart-light/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { api } from '@/lib/api';

/** Two-factor sign-in and signed-in devices, for the settings page. */
export function SecurityCards() {
  const t = useTranslations('Mfa');
  const tSessions = useTranslations('Sessions');
  const format = useFormatter();
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: ['mfa-status'],
    queryFn: () => api.request<MfaStatus>('/v1/auth/mfa'),
  });
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.request<SessionInfo[]>('/v1/auth/sessions'),
  });

  const formatDate = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });
  const message = (error: unknown) => {
    const code = error instanceof ApiClientError ? error.code : '';
    if (code === 'INVALID_MFA_CODE') return t('errors.code');
    if (code === 'INVALID_CURRENT_PASSWORD') return t('errors.password');
    if (code === 'TOO_MANY_REQUESTS') return t('errors.tooMany');
    return t('errors.generic');
  };
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['mfa-status'] });

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      {status.data?.allowed !== false ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t('settingsTitle')}</CardTitle>
              <CardDescription>{t('settingsDescription')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {status.data ? (
              <TwoFactorSettings
                status={status.data}
                formatDate={formatDate}
                onChanged={refresh}
                onStartSetup={async () => {
                  try {
                    return await api.request<MfaSetupResponse>('/v1/auth/mfa/setup', {
                      method: 'POST',
                    });
                  } catch (error) {
                    return message(error);
                  }
                }}
                onEnable={async (code) => {
                  try {
                    const result = await api.request<{ recoveryCodes: string[] }>(
                      '/v1/auth/mfa/enable',
                      { method: 'POST', body: { code } },
                    );
                    return result.recoveryCodes;
                  } catch (error) {
                    return message(error);
                  }
                }}
                onDisable={async (password, code) => {
                  try {
                    await api.request('/v1/auth/mfa/disable', {
                      method: 'POST',
                      body: { password, code },
                    });
                    return null;
                  } catch (error) {
                    return message(error);
                  }
                }}
                onRegenerate={async (code) => {
                  try {
                    const result = await api.request<{ recoveryCodes: string[] }>(
                      '/v1/auth/mfa/recovery-codes',
                      { method: 'POST', body: { code } },
                    );
                    return result.recoveryCodes;
                  } catch (error) {
                    return message(error);
                  }
                }}
                labels={{
                  on: t('on'),
                  off: t('off'),
                  required: t('requiredBadge'),
                  enabledSince: (date) => t('enabledSince', { date }),
                  codesLeft: (count) => t('codesLeft', { count }),
                  intro: t('intro'),
                  turnOn: t('turnOn'),
                  turnOff: t('turnOff'),
                  turnOffHint: t('turnOffHint'),
                  password: t('password'),
                  newCodes: t('newCodes'),
                  newCodesHint: t('newCodesHint'),
                  cancel: t('cancel'),
                  enrol: { steps: t('setupSteps'), qrLabel: t('qrLabel'), manual: t('manual') },
                  code: {
                    code: t('code'),
                    codeHint: t('setupCodeHint'),
                    submit: t('confirm'),
                    submitting: t('verifying'),
                  },
                  recovery: {
                    title: t('recovery.title'),
                    body: t('recovery.body'),
                    copy: t('recovery.copy'),
                    copied: t('recovery.copied'),
                    download: t('recovery.download'),
                    fileName: t('recovery.fileName'),
                    confirm: t('recovery.confirm'),
                    continue: t('recovery.continue'),
                  },
                }}
              />
            ) : (
              <Skeleton className="h-24" />
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{tSessions('title')}</CardTitle>
            <CardDescription>{tSessions('description')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {sessions.data ? (
            <SessionsList
              sessions={sessions.data}
              formatDate={formatDate}
              onRevokeOthers={async () => {
                const result = await api.request<{ revoked: number }>(
                  '/v1/auth/sessions/revoke-others',
                  { method: 'POST' },
                );
                void queryClient.invalidateQueries({ queryKey: ['sessions'] });
                return result.revoked;
              }}
              labels={{
                current: tSessions('current'),
                web: tSessions('web'),
                mobile: tSessions('mobile'),
                since: (date) => tSessions('since', { date }),
                revokeOthers: tSessions('revokeOthers'),
                revoked: (count) => tSessions('revoked', { count }),
                none: tSessions('none'),
              }}
            />
          ) : (
            <Skeleton className="h-24" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
