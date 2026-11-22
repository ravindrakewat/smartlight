import { ApiClientError } from '@smart-light/shared';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton, Card, LabeledInput, Message } from '../src/components/ui';
import { useI18n } from '../src/i18n';
import { useSession, WrongAppError } from '../src/lib/session';
import { colors, radius, spacing } from '../src/theme';

const KNOWN = [
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'ACCOUNT_DISABLED',
  'NETWORK_ERROR',
] as const;

export default function LoginScreen() {
  const { messages: m, toggleLocale } = useI18n();
  const { status, signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'signedIn') {
    return <Redirect href="/" />;
  }

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (caught) {
      if (caught instanceof WrongAppError) {
        setError(m.login.errors.WRONG_APP);
      } else if (
        caught instanceof ApiClientError &&
        (KNOWN as readonly string[]).includes(caught.code)
      ) {
        setError(m.login.errors[caught.code as (typeof KNOWN)[number]]);
      } else {
        setError(m.login.errors.generic);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: radius.md,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.brand }}
                />
              </View>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.foreground }}>
                {m.appName}
              </Text>
            </View>
            <AppButton label={m.common.language} variant="ghost" onPress={toggleLocale} />
          </View>

          <Card style={{ gap: spacing.lg }}>
            <View style={{ gap: spacing.xs }}>
              <Text
                accessibilityRole="header"
                style={{ fontSize: 26, fontWeight: '800', color: colors.foreground }}
              >
                {m.login.title}
              </Text>
              <Text style={{ fontSize: 15, color: colors.muted }}>{m.login.subtitle}</Text>
            </View>
            {error ? <Message text={error} /> : null}
            <LabeledInput
              label={m.login.email}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
            />
            <LabeledInput
              label={m.login.password}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={() => void onSubmit()}
            />
            <AppButton
              label={busy ? m.login.submitting : m.login.submit}
              loading={busy}
              disabled={!email || !password}
              onPress={() => void onSubmit()}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
