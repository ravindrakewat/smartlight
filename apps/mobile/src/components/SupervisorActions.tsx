import {
  ApiClientError,
  REPAIR_CHECKLIST,
  type StaffUserDto,
  type WorkOrderDetailDto,
} from '@smart-light/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { colors, MIN_TOUCH, radius, shadow, spacing } from '../theme';
import { confirmAction, Icon } from './kit';
import { AppButton, Card, Message, styles as ui } from './ui';

const VERIFIERS = new Set(['SUPERVISOR', 'MUNICIPAL_ADMIN']);
const DISPATCHERS = new Set(['SUPERVISOR', 'AGENCY_MANAGER', 'MUNICIPAL_ADMIN']);

/** What the technician recorded: checklist and parts. Shown to everyone once work is done. */
export function RepairRecord({ wo }: { wo: WorkOrderDetailDto }) {
  const { messages: m } = useI18n();
  if (!wo.completedAt) return null;
  return (
    <Card style={shadow}>
      <Text accessibilityRole="header" style={styles.title}>
        {m.supervisor.record}
      </Text>
      {wo.resolutionCode ? (
        <Text style={styles.value}>{m.resolution[wo.resolutionCode]}</Text>
      ) : null}
      {wo.resolutionNotes ? <Text style={styles.muted}>{wo.resolutionNotes}</Text> : null}
      <View style={{ gap: 6 }}>
        {REPAIR_CHECKLIST.map((item) => {
          const done = wo.checklist.includes(item);
          return (
            <View key={item} style={styles.line} accessible>
              <Icon
                name={done ? 'checkmark-circle' : 'remove-circle-outline'}
                size={20}
                color={done ? colors.success : colors.muted}
              />
              <Text style={[styles.lineText, !done && { color: colors.muted }]}>
                {m.job.checklistItems[item]}
                {done ? '' : ` (${m.supervisor.notTicked})`}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={ui.label}>{m.job.parts}</Text>
      {wo.parts.length === 0 ? (
        <Text style={styles.muted}>{m.supervisor.noParts}</Text>
      ) : (
        wo.parts.map((part) => (
          <View key={part.id} style={styles.line}>
            <Text style={[styles.lineText, { flex: 1 }]}>{part.name}</Text>
            <Text style={styles.value}>
              {part.quantity} {part.unit}
            </Text>
          </View>
        ))
      )}
    </Card>
  );
}

/** Approve / reject a finished repair, and (re)assign a technician. */
export function SupervisorActions({ wo }: { wo: WorkOrderDetailDto }) {
  const { messages: m } = useI18n();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [technicianId, setTechnicianId] = useState<string | null>(null);

  const canVerify = !!user && VERIFIERS.has(user.role) && wo.status === 'PENDING_VERIFICATION';
  const canAssign =
    !!user && DISPATCHERS.has(user.role) && ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(wo.status);

  const technicians = useQuery({
    queryKey: ['technicians'],
    queryFn: () =>
      api.page<StaffUserDto>('/v1/users', {
        query: { role: 'TECHNICIAN', status: 'ACTIVE', pageSize: 100 },
      }),
    enabled: canAssign,
    staleTime: 5 * 60_000,
  });

  const action = useMutation({
    mutationFn: (request: { path: 'verify' | 'assign'; body: unknown }) =>
      api.request<WorkOrderDetailDto>(`/v1/work-orders/${wo.id}/${request.path}`, {
        method: 'POST',
        body: request.body,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['job', wo.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
      setNote('');
      setTechnicianId(null);
    },
  });

  if (!canVerify && !canAssign) return null;
  const errorText =
    action.error instanceof ApiClientError && action.error.code !== 'NETWORK_ERROR'
      ? action.error.message
      : action.error
        ? m.common.error
        : null;

  async function decide(approved: boolean) {
    const ok = await confirmAction({
      title: approved ? m.supervisor.approve : m.supervisor.reject,
      message: approved ? m.supervisor.approveConfirm : m.supervisor.rejectConfirm,
      confirm: approved ? m.supervisor.approve : m.supervisor.reject,
      cancel: m.job.cancel,
    });
    if (ok) {
      action.mutate({
        path: 'verify',
        body: { approved, ...(note.trim() ? { note: note.trim() } : {}) },
      });
    }
  }

  return (
    <>
      {errorText ? <Message text={errorText} /> : null}
      {action.isSuccess ? <Message tone="success" text={m.supervisor.saved} /> : null}

      {canVerify ? (
        <Card style={shadow}>
          <Text accessibilityRole="header" style={styles.title}>
            {m.supervisor.verifyTitle}
          </Text>
          <Text style={styles.muted}>
            {wo.pole.hasController ? m.supervisor.verifyIot : m.supervisor.verifyBody}
          </Text>
          <Text style={ui.label}>{m.supervisor.note}</Text>
          <TextInput
            accessibilityLabel={m.supervisor.note}
            value={note}
            onChangeText={setNote}
            maxLength={500}
            multiline
            style={[ui.input, { minHeight: 72, textAlignVertical: 'top', paddingVertical: 8 }]}
          />
          <AppButton
            label={m.supervisor.approve}
            loading={action.isPending}
            icon={<Icon name="shield-checkmark" size={20} color={colors.onPrimary} />}
            onPress={() => void decide(true)}
            style={styles.big}
          />
          <AppButton
            label={m.supervisor.reject}
            variant="outline"
            disabled={action.isPending}
            icon={<Icon name="close-circle" size={20} color={colors.primary} />}
            onPress={() => void decide(false)}
          />
        </Card>
      ) : null}

      {canAssign ? (
        <Card style={shadow}>
          <Text accessibilityRole="header" style={styles.title}>
            {m.supervisor.assignTitle}
          </Text>
          {technicians.isLoading ? <Text style={styles.muted}>{m.common.loading}</Text> : null}
          {technicians.data && technicians.data.items.length === 0 ? (
            <Text style={styles.muted}>{m.supervisor.noTechnicians}</Text>
          ) : null}
          <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
            {(technicians.data?.items ?? []).map((person) => {
              const selected = (technicianId ?? wo.technician?.id) === person.id;
              return (
                <Pressable
                  key={person.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setTechnicianId(person.id)}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <Icon
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={selected ? colors.primary : colors.muted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lineText, selected && { color: colors.primary }]}>
                      {person.name}
                    </Text>
                    {person.agency ? <Text style={styles.muted}>{person.agency.name}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <AppButton
            label={m.supervisor.assign}
            loading={action.isPending}
            disabled={!technicianId || technicianId === wo.technician?.id}
            onPress={() =>
              technicianId && action.mutate({ path: 'assign', body: { technicianId } })
            }
            style={styles.big}
          />
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '800', color: colors.foreground },
  value: { fontSize: 16, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: 14, color: colors.muted },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineText: { fontSize: 15, color: colors.foreground, fontWeight: '600' },
  big: { minHeight: 56, borderRadius: radius.lg },
  option: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primarySubtle,
  },
});
