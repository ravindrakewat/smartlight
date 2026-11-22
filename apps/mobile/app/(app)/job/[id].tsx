import { ApiClientError, RESOLUTION_CODES, type WorkOrderDetailDto } from '@smart-light/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  AppButton,
  Badge,
  Card,
  DetailRow,
  Message,
  styles as ui,
} from '../../../src/components/ui';
import { useI18n, useRelativeTime } from '../../../src/i18n';
import { api } from '../../../src/lib/api';
import { faultLabel, PRIORITY_TONES, STATUS_TONES } from '../../../src/lib/labels';
import { useSession } from '../../../src/lib/session';
import { colors, MIN_TOUCH, radius, spacing } from '../../../src/theme';

type Resolution = (typeof RESOLUTION_CODES)[number];

class LocationDeniedError extends Error {}

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

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { messages: m } = useI18n();
  const relative = useRelativeTime();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [completing, setCompleting] = useState(false);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [notes, setNotes] = useState('');

  const job = useQuery({
    queryKey: ['job', id],
    queryFn: () => api.request<WorkOrderDetailDto>(`/v1/work-orders/${id}`),
  });

  const action = useMutation({
    mutationFn: async (kind: 'start' | 'complete') => {
      const location = await currentLocation();
      return api.request<WorkOrderDetailDto>(`/v1/work-orders/${id}/${kind}`, {
        method: 'POST',
        body:
          kind === 'start'
            ? location
            : { ...location, resolutionCode: resolution, notes: notes || undefined },
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
        : `google.navigation:q=${latitude},${longitude}`;
    void Linking.openURL(url).catch(() =>
      Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
      ),
    );
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

  return (
    <>
      <Stack.Screen options={{ title: wo.number }} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: spacing.sm }}>
          <Text
            accessibilityRole="header"
            style={{ fontSize: 24, fontWeight: '800', color: colors.foreground }}
          >
            {faultLabel(m, wo.faultType)}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Badge label={m.status[wo.status]} tone={STATUS_TONES[wo.status]} />
            <Badge label={m.priority[wo.priority]} tone={PRIORITY_TONES[wo.priority]} />
          </View>
        </View>

        {sentBack ? <Message tone="warning" text={m.job.sentBack} /> : null}
        {errorText ? <Message text={errorText} /> : null}

        <Card>
          <DetailRow
            label={m.job.pole}
            value={
              <Text style={[ui.detailValue, { fontFamily: 'monospace', fontSize: 18 }]}>
                {wo.pole.code}
              </Text>
            }
          />
          {wo.pole.address ? <DetailRow label={m.job.address} value={wo.pole.address} /> : null}
          <DetailRow
            label={m.job.deadline}
            value={
              <Text style={[ui.detailValue, wo.overdue && { color: colors.danger }]}>
                {wo.overdue ? `${m.jobs.overdue} · ` : ''}
                {relative(wo.slaDueAt)}
              </Text>
            }
          />
          <AppButton label={m.job.navigate} variant="outline" onPress={openMaps} />
        </Card>

        {wo.status === 'PENDING_VERIFICATION' ? (
          <Message
            tone="info"
            text={`${m.job.waiting} ${wo.pole.hasController ? m.job.controllerNote : m.job.supervisorNote}`}
          />
        ) : null}

        {mine && wo.status === 'ASSIGNED' ? (
          <AppButton
            label={action.isPending ? m.job.starting : m.job.start}
            loading={action.isPending}
            onPress={() => action.mutate('start')}
          />
        ) : null}

        {mine && wo.status === 'IN_PROGRESS' && !completing ? (
          <AppButton label={m.job.complete} onPress={() => setCompleting(true)} />
        ) : null}

        {mine && wo.status === 'IN_PROGRESS' && completing ? (
          <Card>
            <Text style={ui.label}>{m.job.whatDone}</Text>
            <View
              accessibilityRole="radiogroup"
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}
            >
              {RESOLUTION_CODES.map((code) => {
                const selected = resolution === code;
                return (
                  <Pressable
                    key={code}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setResolution(code)}
                    style={{
                      minHeight: MIN_TOUCH,
                      justifyContent: 'center',
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.md,
                      borderWidth: selected ? 2 : 1,
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.primarySubtle : colors.surface,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '600',
                        color: selected ? colors.primary : colors.foreground,
                      }}
                    >
                      {m.resolution[code]}
                    </Text>
                  </Pressable>
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
              onPress={() => action.mutate('complete')}
            />
            <AppButton label={m.job.cancel} variant="ghost" onPress={() => setCompleting(false)} />
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}
