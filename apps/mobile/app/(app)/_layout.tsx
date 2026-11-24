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
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: colors.onNavy,
        headerTitleStyle: { fontWeight: '800' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="job/[id]" options={{ title: '' }} />
      <Stack.Screen name="history" options={{ title: m.history.title }} />
      <Stack.Screen name="password" options={{ title: m.profile.changePassword }} />
    </Stack>
  );
}
