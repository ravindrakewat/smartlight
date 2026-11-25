import {
  ApiClientError,
  REPAIR_CHECKLIST,
  RESOLUTION_CODES,
  type RepairChecklistItem,
  type SparePartDto,
  type WorkOrderDetailDto,
} from '@smart-light/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { confirmAction, Icon, IconCircle, type IconName } from '../../../src/components/kit';
import { LightTest } from '../../../src/components/LightTest';
import { AppButton, Badge, Card, Message, styles as ui } from '../../../src/components/ui';
import { useI18n, useRelativeTime } from '../../../src/i18n';
import { api } from '../../../src/lib/api';
import { faultLabel, PRIORITY_TONES, STATUS_TONES } from '../../../src/lib/labels';
import { useSession } from '../../../src/lib/session';
import { colors, MIN_TOUCH, radius, shadow, spacing, type ToneName } from '../../../src/theme';

type Resolution = (typeof RESOLUTION_CODES)[number];
type EventType = WorkOrderDetailDto['events'][number]['type'];

class LocationDeniedError extends Error {}

const EVENT_ICONS: Record<EventType, { icon: IconName; tone: ToneName }> = {
  CREATED: { icon: 'add-circle', tone: 'info' },
  ASSIGNED: { icon: 'person', tone: 'info' },
  STARTED: { icon: 'construct', tone: 'info' },
  COMPLETED: { icon: 'checkmark', tone: 'warning' },
  VERIFIED: { icon: 'shield-checkmark', tone: 'success' },
  VERIFICATION_FAILED: { icon: 'close-circle', tone: 'danger' },
  REOPENED: { icon: 'refresh', tone: 'warning' },
  CANCELLED: { icon: 'ban', tone: 'neutral' },
  COMMENT: { icon: 'chatbubble', tone: 'neutral' },
  SLA_BREACHED: { icon: 'alarm', tone: 'danger' },
};

/** Current GPS fix with its accuracy; the API checks the distance to the pole. */
async function currentLocation() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new LocationDeniedError();
  }
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyM: Math.round(position.coords.accuracy ?? 50),
  };
}

function InfoLine({
  icon,
  label,
  value,
  mono,
}: {
  icon: IconName;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.infoLine} accessible>
      <Icon name={icon} size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, mono && { fontFamily: 'monospace' }]}>{value}</Text>
      </View>
    </View>
  );
}

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { messages: m, format, locale } = useI18n();
  const relative = useRelativeTime();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [completing, setCompleting] = useState(false);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [notes, setNotes] = useState('');
  const [checked, setChecked] = useState<RepairChecklistItem[]>([]);
  const [parts, setParts] = useState<Record<string, number>>({});

  const job = useQuery({
    queryKey: ['job', id],
    queryFn: () => api.request<WorkOrderDetailDto>(`/v1/work-orders/${id}`),
  });

  const spareParts = useQuery({
    queryKey: ['spare-parts'],
    queryFn: () => api.request<SparePartDto[]>('/v1/spare-parts'),
    enabled: completing,
    staleTime: 5 * 60_000,
  });

  const toggleItem = (item: RepairChecklistItem) =>
    setChecked((current) =>
      current.includes(item) ? current.filter((value) => value !== item) : [...current, item],
    );
  const changePart = (partId: string, delta: number) =>
    setParts((current) => {
      const next = Math.max(0, Math.min(100, (current[partId] ?? 0) + delta));
      const copy = { ...current };
      if (next === 0) delete copy[partId];
      else copy[partId] = next;
      return copy;
    });

  const action = useMutation({
    mutationFn: async (kind: 'start' | 'complete') => {
      const location = await currentLocation();
      return api.request<WorkOrderDetailDto>(`/v1/work-orders/${id}/${kind}`, {
        method: 'POST',
        body:
          kind === 'start'
            ? location
            : {
                ...location,
                resolutionCode: resolution,
                notes: notes || undefined,
                checklist: checked,
                parts: Object.entries(parts).map(([sparePartId, quantity]) => ({
                  sparePartId,
                  quantity,
                })),
              },
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['job', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
      setCompleting(false);
    },
  });

  const wo = job.data;
  const errorText = (() => {
    const error = action.error;
    if (!error) return null;
    if (error instanceof LocationDeniedError) return m.job.locationDenied;
    if (error instanceof ApiClientError && error.code !== 'NETWORK_ERROR') return error.message;
    return m.common.error;
  })();

  function openMaps() {
    if (!wo) return;
    const { latitude, longitude } = wo.pole;
    const url =
      Platform.OS === 'ios'
        ? `maps://?daddr=${latitude},${longitude}`
        : Platform.OS === 'android'
          ? `google.navigation:q=${latitude},${longitude}`
          : `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    void Linking.openURL(url).catch(() =>
      Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
      ),
    );
  }

  async function start() {
    const ok = await confirmAction({
      title: m.job.start,
      message: m.job.startConfirm,
      confirm: m.job.start,
      cancel: m.job.cancel,
    });
    if (ok) action.mutate('start');
  }

  async function submit() {
    const ok = await confirmAction({
      title: m.job.submitComplete,
      message: m.job.submitConfirm,
      confirm: m.job.submitComplete,
      cancel: m.job.cancel,
    });
    if (ok) action.mutate('complete');
  }

  if (!wo) {
    return (
      <View style={{ padding: spacing.lg }}>
        {job.error ? (
          <Message text={m.common.error} />
        ) : (
          <Text style={{ color: colors.muted }}>{m.common.loading}</Text>
        )}
      </View>
    );
  }

  const mine = wo.technician?.id === user?.id;
  const sentBack = wo.status === 'ASSIGNED' && wo.events.at(-1)?.type === 'VERIFICATION_FAILED';
  const finished = wo.status === 'RESOLVED' || wo.status === 'CANCELLED';

  return (
    <>
      <Stack.Screen options={{ title: wo.number }} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* What and how urgent */}
        <View style={styles.hero}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Badge label={m.priority[wo.priority]} tone={PRIORITY_TONES[wo.priority]} />
            <Badge label={m.status[wo.status]} tone={STATUS_TONES[wo.status]} />
          </View>
          <Text accessibilityRole="header" style={styles.heroTitle}>
            {faultLabel(m, wo.faultType)}
          </Text>
          {!finished ? (
            <View style={styles.deadline}>
              <Icon
                name={wo.overdue ? 'alarm' : 'time-outline'}
                size={20}
                color={wo.overdue ? '#fca5a5' : colors.onNavyMuted}
              />
              <Text style={[styles.deadlineText, wo.overdue && { color: '#fca5a5' }]}>
                {wo.overdue ? `${m.jobs.overdue} · ` : `${m.job.deadline}: `}
                {relative(wo.slaDueAt)}
              </Text>
            </View>
          ) : null}
        </View>

        {sentBack ? <Message tone="warning" text={m.job.sentBack} /> : null}
        {errorText ? <Message text={errorText} /> : null}

        <Card style={shadow}>
          <InfoLine icon="flashlight-outline" label={m.job.pole} value={wo.pole.code} mono />
          <InfoLine
            icon="hardware-chip-outline"
            label={m.job.controller}
            value={wo.pole.hasController ? m.job.fitted : m.job.notFitted}
          />
          <InfoLine
            icon="location-outline"
            label={m.job.address}
            value={[wo.pole.address, wo.pole.zoneName].filter(Boolean).join(' · ') || '—'}
          />
          {wo.description ? (
            <InfoLine
              icon="document-text-outline"
              label={m.job.description}
              value={wo.description}
            />
          ) : null}
          <AppButton
            label={m.job.navigate}
            variant="outline"
            icon={<Icon name="navigate" size={20} color={colors.primary} />}
            onPress={openMaps}
          />
        </Card>

        {wo.status === 'PENDING_VERIFICATION' ? (
          <Message
            tone="info"
            text={`${m.job.waiting} ${wo.pole.hasController ? m.job.controllerNote : m.job.supervisorNote}`}
          />
        ) : null}

        {mine &&
        wo.pole.hasController &&
        ['ASSIGNED', 'IN_PROGRESS', 'PENDING_VERIFICATION'].includes(wo.status) ? (
          <LightTest poleId={wo.pole.id} />
        ) : null}

        {mine && wo.status === 'ASSIGNED' ? (
          <AppButton
            label={action.isPending ? m.job.starting : m.job.start}
            loading={action.isPending}
            icon={<Icon name="play" size={20} color={colors.onPrimary} />}
            onPress={() => void start()}
            style={styles.bigButton}
          />
        ) : null}

        {mine && wo.status === 'IN_PROGRESS' && !completing ? (
          <AppButton
            label={m.job.complete}
            icon={<Icon name="checkmark-done" size={20} color={colors.onPrimary} />}
            onPress={() => setCompleting(true)}
            style={styles.bigButton}
          />
        ) : null}

        {mine && wo.status === 'IN_PROGRESS' && completing ? (
          <Card style={shadow}>
            <Text style={ui.label}>{m.job.whatDone}</Text>
            <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
              {RESOLUTION_CODES.map((code) => {
                const selected = resolution === code;
                return (
                  <Pressable
                    key={code}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setResolution(code)}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <Icon
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={selected ? colors.primary : colors.muted}
                    />
                    <Text style={[styles.optionText, selected && { color: colors.primary }]}>
                      {m.resolution[code]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={ui.label}>{m.job.checklist}</Text>
            <Text style={styles.hint}>{m.job.checklistHint}</Text>
            <View style={{ gap: spacing.sm }}>
              {REPAIR_CHECKLIST.map((item) => {
                const done = checked.includes(item);
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done }}
                    onPress={() => toggleItem(item)}
                    style={[styles.option, done && styles.optionSelected]}
                  >
                    <Icon
                      name={done ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={done ? colors.primary : colors.muted}
                    />
                    <Text style={[styles.optionText, done && { color: colors.primary }]}>
                      {m.job.checklistItems[item]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={ui.label}>{m.job.parts}</Text>
            <Text style={styles.hint}>{m.job.partsHint}</Text>
            {spareParts.data && spareParts.data.length === 0 ? (
              <Text style={styles.hint}>{m.job.noPartsStocked}</Text>
            ) : null}
            <View style={{ gap: spacing.sm }}>
              {(spareParts.data ?? []).map((part) => {
                const count = parts[part.id] ?? 0;
                const name = locale === 'hi' && part.nameHi ? part.nameHi : part.name;
                return (
                  <View key={part.id} style={[styles.partRow, count > 0 && styles.optionSelected]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionText}>{name}</Text>
                      <Text style={styles.hint}>
                        {format(m.job.inStock, { count: `${part.stockQty} ${part.unit}` })}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={format(m.job.fewer, { name })}
                      disabled={count === 0}
                      onPress={() => changePart(part.id, -1)}
                      style={[styles.stepper, count === 0 && { opacity: 0.4 }]}
                    >
                      <Icon name="remove" size={22} color={colors.primary} />
                    </Pressable>
                    <Text style={styles.count} accessibilityLiveRegion="polite">
                      {count}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={format(m.job.more, { name })}
                      onPress={() => changePart(part.id, 1)}
                      style={styles.stepper}
                    >
                      <Icon name="add" size={22} color={colors.primary} />
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <Text style={ui.label}>{m.job.notes}</Text>
            <TextInput
              accessibilityLabel={m.job.notes}
              value={notes}
              onChangeText={setNotes}
              multiline
              maxLength={1000}
              style={[
                ui.input,
                { minHeight: 96, textAlignVertical: 'top', paddingVertical: spacing.sm },
              ]}
            />
            <AppButton
              label={action.isPending ? m.job.completing : m.job.submitComplete}
              loading={action.isPending}
              disabled={!resolution}
              onPress={() => void submit()}
              style={styles.bigButton}
            />
            <AppButton label={m.job.cancel} variant="ghost" onPress={() => setCompleting(false)} />
          </Card>
        ) : null}

        {/* History of this job */}
        <Card style={shadow}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {m.job.timeline}
          </Text>
          {[...wo.events].reverse().map((event, index, list) => {
            const meta = EVENT_ICONS[event.type];
            return (
              <View key={event.id} style={styles.event}>
                <View style={{ alignItems: 'center' }}>
                  <IconCircle name={meta.icon} tone={meta.tone} size={36} />
                  {index < list.length - 1 ? <View style={styles.eventLine} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: spacing.md }}>
                  <Text style={styles.eventTitle}>{m.events[event.type]}</Text>
                  <Text style={styles.eventMeta}>
                    {[event.actorName, relative(event.createdAt)].filter(Boolean).join(' · ')}
                  </Text>
                  {event.note ? <Text style={styles.eventNote}>{event.note}</Text> : null}
                </View>
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.navy,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow,
  },
  heroTitle: { fontSize: 26, fontWeight: '900', color: colors.onNavy },
  deadline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deadlineText: { fontSize: 16, fontWeight: '700', color: colors.onNavyMuted },
  infoLine: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  infoLabel: { fontSize: 13, color: colors.muted },
  infoValue: { fontSize: 17, fontWeight: '700', color: colors.foreground },
  bigButton: { minHeight: 56, borderRadius: radius.lg },
  option: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primarySubtle,
  },
  optionText: { fontSize: 16, fontWeight: '600', color: colors.foreground },
  hint: { fontSize: 14, color: colors.muted },
  partRow: {
    minHeight: MIN_TOUCH + 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepper: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  count: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: colors.foreground,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.foreground },
  event: { flexDirection: 'row', gap: spacing.md },
  eventLine: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
  eventTitle: { fontSize: 16, fontWeight: '700', color: colors.foreground },
  eventMeta: { fontSize: 13, color: colors.muted },
  eventNote: { fontSize: 14, color: colors.foreground, marginTop: 2 },
});
