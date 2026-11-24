import { ApiClientError } from '@smart-light/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppButton, Card, LabeledInput, Message } from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { api } from '../../src/lib/api';
import { colors, spacing } from '../../src/theme';

/** Same rule as the API (10+ characters, upper case, lower case, digit). */
const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,128}$/;

export default function PasswordScreen() {
  const { messages: m } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () =>
      api.request('/v1/auth/change-password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setRepeat('');
    },
  });

  function submit() {
    change.reset();
    if (next !== repeat) {
      setLocalError(m.profile.mismatch);
      return;
    }
    if (!STRONG.test(next)) {
      setLocalError(m.profile.weak);
      return;
    }
    setLocalError(null);
    change.mutate();
  }

  const apiError = change.error
    ? change.error instanceof ApiClientError && change.error.code === 'INVALID_CURRENT_PASSWORD'
      ? m.profile.wrongCurrent
      : change.error instanceof ApiClientError && change.error.code === 'VALIDATION_ERROR'
        ? m.profile.weak
        : m.common.error
    : null;

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <Card>
        <View style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: 15, color: colors.muted }}>{m.profile.passwordHint}</Text>
        </View>
        {(localError ?? apiError) ? <Message text={(localError ?? apiError) as string} /> : null}
        {change.isSuccess ? <Message tone="success" text={m.profile.changed} /> : null}
        <LabeledInput
          label={m.profile.current}
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoComplete="current-password"
        />
        <LabeledInput
          label={m.profile.next}
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoComplete="new-password"
        />
        <LabeledInput
          label={m.profile.repeat}
          value={repeat}
          onChangeText={setRepeat}
          secureTextEntry
          autoComplete="new-password"
        />
        <AppButton
          label={m.profile.submit}
          loading={change.isPending}
          disabled={!current || !next || !repeat}
          onPress={submit}
        />
      </Card>
    </ScrollView>
  );
}
