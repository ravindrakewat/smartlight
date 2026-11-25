import type { WorkOrderDetailDto, WorkOrderPhotoDto } from '@smart-light/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { api, apiUrl, uploadFile } from '../lib/api';
import { colors, MIN_TOUCH, radius, shadow, spacing } from '../theme';
import { Icon } from './kit';
import { AppButton, Card, Message } from './ui';

type Kind = 'BEFORE' | 'AFTER';

/** Best-effort GPS for the photo; a photo is still useful without it. */
async function position() {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') return {};
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
  } catch {
    return {};
  }
}

/** Before / after photos of a repair: taken in the app, uploaded privately to the API. */
export function RepairPhotos({ wo, canAdd }: { wo: WorkOrderDetailDto; canAdd: boolean }) {
  const { messages: m } = useI18n();
  const queryClient = useQueryClient();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [shooting, setShooting] = useState<Kind | null>(null);

  const photos = useQuery({
    queryKey: ['job', wo.id, 'photos'],
    queryFn: () => api.request<WorkOrderPhotoDto[]>(`/v1/work-orders/${wo.id}/photos`),
    staleTime: 5 * 60_000,
  });
  const upload = useMutation({
    mutationFn: async ({ kind, uri }: { kind: Kind; uri: string }) =>
      uploadFile(`/v1/work-orders/${wo.id}/photos`, uri, 'image/jpeg', {
        kind,
        takenAt: new Date().toISOString(),
        ...(await position()),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['job', wo.id, 'photos'] }),
  });

  const items = photos.data ?? [];
  const allowBefore = canAdd && ['ASSIGNED', 'IN_PROGRESS'].includes(wo.status);
  const allowAfter = canAdd && ['IN_PROGRESS', 'PENDING_VERIFICATION'].includes(wo.status);
  if (items.length === 0 && !allowBefore && !allowAfter) return null;

  async function open(kind: Kind) {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setShooting(kind);
  }

  async function take() {
    const kind = shooting;
    const picture = await camera.current?.takePictureAsync({ quality: 0.5 });
    setShooting(null);
    if (kind && picture?.uri) upload.mutate({ kind, uri: picture.uri });
  }

  return (
    <Card style={shadow}>
      <Text accessibilityRole="header" style={styles.title}>
        {m.photos.title}
      </Text>
      {upload.isError ? (
        <Message text={upload.error instanceof Error ? upload.error.message : m.common.error} />
      ) : null}
      {upload.isPending ? <Message tone="info" text={m.photos.uploading} /> : null}
      {(['BEFORE', 'AFTER'] as const).map((kind) => {
        const ofKind = items.filter((photo) => photo.kind === kind);
        const allowed = kind === 'BEFORE' ? allowBefore : allowAfter;
        return (
          <View key={kind} style={{ gap: spacing.sm }}>
            <Text style={styles.label}>
              {kind === 'BEFORE' ? m.photos.before : m.photos.after} ({ofKind.length})
            </Text>
            <View style={styles.row}>
              {ofKind.map((photo) => (
                <Image
                  key={photo.id}
                  source={{ uri: apiUrl(photo.url) }}
                  style={styles.thumb}
                  accessibilityLabel={kind === 'BEFORE' ? m.photos.before : m.photos.after}
                />
              ))}
              {allowed ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={kind === 'BEFORE' ? m.photos.addBefore : m.photos.addAfter}
                  onPress={() => void open(kind)}
                  disabled={upload.isPending}
                  style={[styles.thumb, styles.add]}
                >
                  <Icon name="camera" size={26} color={colors.primary} />
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}

      <Modal
        visible={shooting !== null}
        animationType="slide"
        onRequestClose={() => setShooting(null)}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView ref={camera} style={{ flex: 1 }} facing="back" />
          <View style={styles.cameraBar}>
            <AppButton label={m.job.cancel} variant="ghost" onPress={() => setShooting(null)} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={m.photos.shutter}
              onPress={() => void take()}
              style={styles.shutter}
            />
          </View>
        </View>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '800', color: colors.foreground },
  label: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.border },
  add: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primarySubtle,
    minHeight: MIN_TOUCH,
  },
  cameraBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    backgroundColor: '#000',
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 5,
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginRight: spacing.xl,
  },
});
