import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../../src/components/kit';
import { useI18n } from '../../../src/i18n';
import { useOpenAlertCount } from '../../../src/lib/queries';
import { colors, shadow } from '../../../src/theme';

function tabIcon(name: IconName, active: IconName) {
  return function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Icon name={focused ? active : name} size={24} color={String(color)} />;
  };
}

/** Raised round scan button in the middle of the tab bar. */
function ScanIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.scan, focused && { backgroundColor: colors.primaryPressed }]}>
      <Icon name="qr-code" size={28} color={colors.onPrimary} />
    </View>
  );
}

export default function TabsLayout() {
  const { messages: m } = useI18n();
  const insets = useSafeAreaInsets();
  const alerts = useOpenAlertCount();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarStyle: {
          height: 64 + Math.max(insets.bottom, Platform.OS === 'web' ? 6 : 0),
          paddingTop: 6,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          ...shadow,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: m.nav.home, tabBarIcon: tabIcon('home-outline', 'home') }}
      />
      <Tabs.Screen
        name="work"
        options={{ title: m.nav.work, tabBarIcon: tabIcon('clipboard-outline', 'clipboard') }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: m.nav.scan,
          tabBarIcon: ScanIcon,
          tabBarLabelStyle: { fontSize: 12, fontWeight: '800', marginTop: 10 },
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: m.nav.alerts,
          tabBarIcon: tabIcon('notifications-outline', 'notifications'),
          tabBarBadge: alerts ? (alerts > 99 ? '99+' : alerts) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, fontWeight: '800' },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: m.nav.profile,
          tabBarIcon: tabIcon('person-circle-outline', 'person-circle'),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scan: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginTop: -26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 4,
    borderColor: colors.surface,
    ...shadow,
    shadowOpacity: 0.25,
  },
});
