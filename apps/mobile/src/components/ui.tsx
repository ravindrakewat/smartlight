import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, MIN_TOUCH, radius, spacing, tones, type ToneName } from '../theme';

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  const foreground =
    variant === 'primary' || variant === 'danger'
      ? colors.onPrimary
      : variant === 'outline'
        ? colors.foreground
        : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && {
          backgroundColor: pressed ? colors.primaryPressed : colors.primary,
        },
        variant === 'danger' && { backgroundColor: colors.danger },
        variant === 'outline' && styles.buttonOutline,
        variant === 'ghost' && pressed && { backgroundColor: colors.surfaceSubtle },
        inactive && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={foreground} /> : icon}
      <Text style={[styles.buttonLabel, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: ToneName }) {
  return (
    <View style={[styles.badge, { backgroundColor: tones[tone].bg }]}>
      <Text style={[styles.badgeText, { color: tones[tone].fg }]}>{label}</Text>
    </View>
  );
}

export function Message({ text, tone = 'danger' }: { text: string; tone?: ToneName }) {
  return (
    <View
      accessibilityRole={tone === 'danger' ? 'alert' : 'text'}
      style={[styles.message, { backgroundColor: tones[tone].bg }]}
    >
      <Text style={{ color: tones[tone].fg, fontSize: 15, lineHeight: 22 }}>{text}</Text>
    </View>
  );
}

export function LabeledInput({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      {typeof value === 'string' ? <Text style={styles.detailValue}>{value}</Text> : value}
    </View>
  );
}

export const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  buttonLabel: { fontSize: 16, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 13, fontWeight: '700' },
  message: { borderRadius: radius.md, padding: spacing.md },
  label: { fontSize: 15, fontWeight: '600', color: colors.foreground },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 17,
    color: colors.foreground,
    backgroundColor: colors.surface,
  },
  detailRow: { gap: 2 },
  detailLabel: { fontSize: 13, color: colors.muted },
  detailValue: { fontSize: 16, fontWeight: '600', color: colors.foreground },
});
