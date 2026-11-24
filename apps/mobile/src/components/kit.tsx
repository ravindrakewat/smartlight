import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, MIN_TOUCH, radius, shadow, spacing, tones, type ToneName } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Decorative icon: hidden from screen readers, the text next to it says the same. */
export function Icon({
  name,
  size = 22,
  color = colors.foreground,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** Icon in a soft tinted circle. */
export function IconCircle({
  name,
  tone = 'info',
  size = 44,
  solid = false,
}: {
  name: IconName;
  tone?: ToneName;
  size?: number;
  solid?: boolean;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: solid ? tones[tone].fg : tones[tone].bg,
      }}
    >
      <Icon name={name} size={size * 0.5} color={solid ? colors.onPrimary : tones[tone].fg} />
    </View>
  );
}

/** Navy top area of a tab screen, under the status bar. */
export function NavyHeader({
  title,
  subtitle,
  left,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[kit.navy, { paddingTop: insets.top + spacing.md }]}>
      <View style={kit.navyRow}>
        {left}
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={kit.navyTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={kit.navySubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Round icon button for headers (bell, filter, back). */
export function HeaderButton({
  icon,
  label,
  onPress,
  badge,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label} (${badge})` : label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [kit.headerButton, pressed && { backgroundColor: colors.navySoft }]}
    >
      <Icon name={icon} size={24} color={colors.onNavy} />
      {badge ? (
        <View style={kit.badgeDot}>
          <Text style={kit.badgeDotText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Headline number with an icon; pressable when it doubles as a filter. */
export function StatTile({
  icon,
  tone,
  label,
  value,
  hint,
  onPress,
  selected,
  style,
}: {
  icon: IconName;
  tone: ToneName;
  label: string;
  value: string;
  hint?: string;
  onPress?: () => void;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const body = (
    <>
      <IconCircle name={icon} tone={tone} />
      <View style={{ flex: 1 }}>
        <Text style={kit.statLabel} numberOfLines={2}>
          {label}
        </Text>
        <Text style={kit.statValue}>{value}</Text>
        {hint ? <Text style={[kit.statHint, { color: tones[tone].fg }]}>{hint}</Text> : null}
      </View>
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => [
        kit.stat,
        selected && { borderColor: colors.primary, borderWidth: 2 },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={[kit.stat, style]}>{body}</View>
  );
}

/** Horizontal row of filter chips. */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  label,
  onNavy = false,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  onNavy?: boolean;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[
              kit.chip,
              onNavy &&
                !selected && { backgroundColor: colors.navySoft, borderColor: colors.navySoft },
              selected && { backgroundColor: colors.primary, borderColor: colors.onNavy },
            ]}
          >
            <Text
              style={[
                kit.chipText,
                onNavy && { color: colors.onNavy },
                selected && { color: colors.onPrimary },
              ]}
            >
              {option.label}
              {option.count !== undefined ? ` (${option.count})` : ''}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={kit.sectionHeader}>
      <Text accessibilityRole="header" style={kit.sectionTitle}>
        {title}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="link"
          onPress={action.onPress}
          hitSlop={8}
          style={kit.sectionAction}
        >
          <Text style={kit.sectionActionText}>{action.label}</Text>
          <Icon name="arrow-forward" size={16} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Settings-style row with an icon, a label and a chevron (or a custom right side). */
export function ListRow({
  icon,
  label,
  value,
  onPress,
  tone = 'info',
  danger = false,
  right,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  tone?: ToneName;
  danger?: boolean;
  right?: ReactNode;
}) {
  const color = danger ? colors.danger : colors.foreground;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [kit.row, pressed && { backgroundColor: colors.surfaceSubtle }]}
    >
      <Icon name={icon} size={22} color={danger ? colors.danger : tones[tone].fg} />
      <Text style={[kit.rowLabel, { color }]}>{label}</Text>
      {value ? <Text style={kit.rowValue}>{value}</Text> : null}
      {right ?? (onPress ? <Icon name="chevron-forward" size={20} color={colors.muted} /> : null)}
    </Pressable>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  return (
    <View style={kit.search}>
      <Icon name="search" size={20} color={colors.muted} />
      <TextInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={kit.searchInput}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="×"
          onPress={() => onChangeText('')}
        >
          <Icon name="close-circle" size={20} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: IconName;
  title: string;
  body?: string;
}) {
  return (
    <View style={kit.empty}>
      <IconCircle name={icon} tone="success" size={64} />
      <Text style={kit.emptyTitle}>{title}</Text>
      {body ? <Text style={kit.emptyBody}>{body}</Text> : null}
    </View>
  );
}

/** Asks before an important action. Native dialog on phones, browser dialog on the web. */
export function confirmAction(options: {
  title: string;
  message: string;
  confirm: string;
  cancel: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm?.(`${options.title}\n\n${options.message}`) ?? true);
  }
  return new Promise((resolve) => {
    Alert.alert(options.title, options.message, [
      { text: options.cancel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: options.confirm,
        style: options.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

/** A short street at night (poles with glowing lamps), drawn with views. Decorative. */
export function NightStreet({ lit = 7, height = 92 }: { lit?: number; height?: number }) {
  return (
    <View
      style={[kit.street, { height }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={kit.streetRoad}>
        <View style={kit.streetLine} />
      </View>
      <View style={kit.streetPoles}>
        {Array.from({ length: 7 }, (_, index) => {
          const scale = 0.55 + index * 0.075;
          const on = index < lit;
          return (
            <View key={index} style={[kit.poleSlot, { transform: [{ scale }] }]}>
              {on ? <View style={kit.cone} /> : null}
              <View style={[kit.lampHead, { backgroundColor: on ? colors.lampCore : '#3b4660' }]} />
              <View style={kit.poleBody} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

export const kit = StyleSheet.create({
  navy: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  navyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  navyTitle: { fontSize: 22, fontWeight: '800', color: colors.onNavy },
  navySubtitle: { fontSize: 14, color: colors.onNavyMuted, marginTop: 2 },
  headerButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.navy,
  },
  badgeDotText: { color: colors.onPrimary, fontSize: 11, fontWeight: '800' },
  stat: {
    flex: 1,
    minWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  statLabel: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  statValue: { fontSize: 26, fontWeight: '800', color: colors.foreground },
  statHint: { fontSize: 13, fontWeight: '700' },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipText: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: colors.foreground },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  sectionActionText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowLabel: { flex: 1, fontSize: 17, fontWeight: '600' },
  rowValue: { fontSize: 15, color: colors.muted },
  search: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.foreground, minHeight: MIN_TOUCH },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.foreground, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  street: {
    height: 92,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.navySoft,
    justifyContent: 'flex-end',
  },
  streetRoad: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 18,
    backgroundColor: '#283350',
    justifyContent: 'center',
  },
  streetLine: { height: 2, marginHorizontal: 8, backgroundColor: colors.lamp, opacity: 0.35 },
  streetPoles: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingBottom: 10,
    paddingHorizontal: spacing.sm,
  },
  poleSlot: { width: 40, height: 64, alignItems: 'center', justifyContent: 'flex-end' },
  cone: {
    position: 'absolute',
    top: 10,
    left: 11,
    width: 0,
    height: 0,
    borderLeftWidth: 14,
    borderRightWidth: 14,
    borderBottomWidth: 54,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(253, 230, 138, 0.28)',
  },
  lampHead: { width: 16, height: 5, borderRadius: 3, marginLeft: 10 },
  poleBody: { width: 3, height: 52, backgroundColor: '#8b98b0', borderRadius: 2 },
});
