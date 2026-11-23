import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useI18n } from '../../src/i18n';
import { useSession } from '../../src/lib/session';
import { colors } from '../../src/theme';

/** Everything in this group requires a signed-in technician or supervisor. */
export default function AppLayout() {
  const { status } = useSession();
  const { messages: m } = useI18n();

  if (status === 'loading') {
    return (
      <View
        accessibilityLabel={m.common.loading}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (status === 'signedOut') {
    return <Redirect href="/login" />;
  }
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.foreground,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: m.jobs.title }} />
      <Stack.Screen name="job/[id]" options={{ title: '' }} />
      <Stack.Screen name="scan" options={{ title: m.scan.title }} />
      <Stack.Screen name="profile" options={{ title: m.profile.title }} />
    </Stack>
  );
}
