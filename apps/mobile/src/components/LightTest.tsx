import { ApiClientError, type ControlResultDto, type PoleLiveDto } from '@smart-light/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { colors, spacing } from '../theme';
import { AppButton, Card, Message } from './ui';

/** Test switch-on lasts 10 minutes (the API allows technicians up to 15). */
const TEST_MINUTES = 10;
/** A lamp that is really lit draws clearly more than the controller's own idle power. */
const LIT_MIN_WATTS = 5;
const POLL_MS = 5_000;
const GIVE_UP_MS = 2 * 60_000;

/**
 * Lets the technician switch the lamp on from the pole and see the controller
 * confirm it: switched on, and drawing real power. The same reading verifies
 * the repair automatically once the job is completed.
 */
export function LightTest({ poleId }: { poleId: string }) {
  const { messages: m, format } = useI18n();
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const switchOn = useMutation({
    mutationFn: (action: 'on' | 'auto') =>
      api.request<ControlResultDto>('/v1/lighting/commands', {
        method: 'POST',
        body: {
          target: { type: 'pole', poleId },
          control:
            action === 'on'
              ? { action: 'on', dimPercent: 100, durationMinutes: TEST_MINUTES }
              : { action: 'auto' },
        },
      }),
    onSuccess: (_result, action) => setStartedAt(action === 'on' ? Date.now() : null),
  });

  const watching = startedAt !== null && Date.now() - startedAt < GIVE_UP_MS;
  const live = useQuery({
    queryKey: ['pole-live', poleId],
    queryFn: () => api.request<PoleLiveDto>(`/v1/poles/${poleId}/live`),
    enabled: startedAt !== null,
    refetchInterval: watching ? POLL_MS : false,
  });

  const device = live.data?.device;
  const testCommand = live.data?.commands.find(
    (command) =>
      command.action === 'set_output' &&
      command.on &&
      startedAt !== null &&
      new Date(command.createdAt).getTime() >= startedAt - 5_000,
  );
  const reportedSince =
    startedAt !== null && device?.lastTelemetryAt
      ? new Date(device.lastTelemetryAt).getTime() >= startedAt
      : false;

  let result: { tone: 'success' | 'warning' | 'danger' | 'info'; text: string } | null = null;
  if (startedAt !== null) {
    if (testCommand?.status === 'REJECTED' || testCommand?.status === 'EXPIRED') {
      result = { tone: 'danger', text: m.lightTest.notDelivered };
    } else if (testCommand?.status === 'ACCEPTED' && reportedSince && device?.lampOn) {
      result =
        (device.powerW ?? 0) >= LIT_MIN_WATTS
          ? {
              tone: 'success',
              text: format(m.lightTest.lit, { watts: Math.round(device.powerW ?? 0) }),
            }
          : { tone: 'danger', text: m.lightTest.noPower };
    } else if (!watching) {
      result = { tone: 'warning', text: m.lightTest.noAnswer };
    } else {
      result = { tone: 'info', text: m.lightTest.waiting };
    }
  }

  const errorText =
    switchOn.error instanceof ApiClientError && switchOn.error.status === 403
      ? m.lightTest.forbidden
      : switchOn.error
        ? m.common.error
        : null;

  return (
    <Card>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.foreground }}>
          {m.lightTest.title}
        </Text>
        <Text style={{ fontSize: 14, color: colors.muted }}>
          {format(m.lightTest.hint, { minutes: TEST_MINUTES })}
        </Text>
      </View>
      {errorText ? <Message text={errorText} /> : null}
      {result ? <Message tone={result.tone} text={result.text} /> : null}
      <AppButton
        label={m.lightTest.switchOn}
        loading={switchOn.isPending && switchOn.variables === 'on'}
        onPress={() => switchOn.mutate('on')}
      />
      {startedAt !== null ? (
        <AppButton
          label={m.lightTest.backToSchedule}
          variant="ghost"
          loading={switchOn.isPending && switchOn.variables === 'auto'}
          onPress={() => switchOn.mutate('auto')}
        />
      ) : null}
    </Card>
  );
}
