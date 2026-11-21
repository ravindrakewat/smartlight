import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApplicationId } from '@smart-light/shared';
import { mobileEnv } from '../config/env';

export function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PHASE 0 · FOUNDATION</Text>
        </View>

        <Text style={styles.subtitle}>Smart Street Light Management System</Text>
        <Text style={styles.title}>{mobileEnv.EXPO_PUBLIC_APP_NAME}</Text>
        <Text style={styles.description}>
          Cross-platform Expo mobile starter for field operations. Consumes the central Express API
          and shared TypeScript contracts while keeping its own React Native UI system.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Runtime Configuration</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Application ID</Text>
            <Text style={styles.value}>{ApplicationId.Mobile}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Central API Base URL</Text>
            <Text style={styles.value}>{mobileEnv.EXPO_PUBLIC_API_BASE_URL}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>UI Layer</Text>
            <Text style={styles.value}>Dedicated React Native Components</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    padding: 20,
    gap: 14,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginTop: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  row: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
  },
});
