import { ApiClientError, parsePoleCode, type PoleDto } from '@smart-light/shared';
import { useMutation } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, DetailRow, Message } from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { api } from '../../src/lib/api';
import { colors, radius, spacing } from '../../src/theme';

/** QR plates encode https://<city>.<domain>/p/<code>; a bare code is accepted too. */
function extractPoleCode(data: string): string | null {
  const candidate = data.includes('/') ? (data.split('/').filter(Boolean).at(-1) ?? '') : data;
  return parsePoleCode(decodeURIComponent(candidate))?.code ?? null;
}

class InvalidQrError extends Error {}

export default function ScanScreen() {
  const { messages: m } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const handling = useRef(false);

  const lookup = useMutation({
    mutationFn: async (data: string) => {
      const code = extractPoleCode(data);
      if (!code) {
        throw new InvalidQrError();
      }
      return api.request<PoleDto>(`/v1/poles/by-code/${encodeURIComponent(code)}`);
    },
    onSettled: () => {
      handling.current = false;
    },
  });

  const error = lookup.error
    ? lookup.error instanceof InvalidQrError
      ? m.scan.invalid
      : lookup.error instanceof ApiClientError && lookup.error.status === 404
        ? m.scan.notFound
        : m.common.error
    : null;

  if (!permission) {
    return null;
  }
  if (!permission.granted) {
    return (
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
        <Message tone="info" text={m.scan.permission} />
        <AppButton label={m.scan.allow} onPress={() => void requestPermission()} />
      </View>
    );
  }

  const pole = lookup.data;
  const scanning = !pole && !error;

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      {scanning ? (
        <>
          <Text style={{ fontSize: 16, color: colors.muted }}>{m.scan.hint}</Text>
          <View style={styles.cameraFrame}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (!handling.current) {
                  handling.current = true;
                  lookup.mutate(data);
                }
              }}
            />
          </View>
        </>
      ) : null}

      {error ? <Message text={error} /> : null}

      {pole ? (
        <Card>
          <Text
            style={{
              fontSize: 24,
              fontWeight: '800',
              fontFamily: 'monospace',
              color: colors.foreground,
            }}
          >
            {pole.code}
          </Text>
          {pole.address ? (
            <Text style={{ fontSize: 16, color: colors.muted }}>{pole.address}</Text>
          ) : null}
          <DetailRow label={m.scan.light} value={m.light[pole.lightStatus]} />
          <DetailRow label={m.scan.zone} value={pole.zone?.name ?? '—'} />
          <DetailRow
            label={m.scan.controller}
            value={
              pole.device
                ? `${pole.device.deviceId} · ${pole.device.online ? m.light.ON : m.light.OFFLINE}`
                : m.scan.noController
            }
          />
        </Card>
      ) : null}

      {!scanning ? (
        <AppButton label={m.scan.again} variant="outline" onPress={() => lookup.reset()} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cameraFrame: {
    height: 360,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
});
