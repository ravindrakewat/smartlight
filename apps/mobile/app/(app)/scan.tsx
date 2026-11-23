import { ApiClientError, MQTT_ID_PATTERN, parsePoleCode, type PoleDto } from '@smart-light/shared';
import { useMutation } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, DetailRow, Message } from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { api } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { colors, radius, spacing } from '../../src/theme';

/** QR plates encode https://<city>.<domain>/p/<code>; a bare code is accepted too. */
function extractPoleCode(data: string): string | null {
  const candidate = data.includes('/') ? (data.split('/').filter(Boolean).at(-1) ?? '') : data;
  return parsePoleCode(decodeURIComponent(candidate))?.code ?? null;
}

/** Controller labels carry the device id (e.g. `sl-000123`), bare or at the end of a URL. */
function extractDeviceId(data: string): string | null {
  const candidate = (
    data
      .split(/[/?=#]/)
      .filter(Boolean)
      .at(-1) ?? ''
  )
    .trim()
    .toLowerCase();
  return MQTT_ID_PATTERN.test(candidate) ? candidate : null;
}

/** Roles that may fit controllers (the API enforces the same list). */
const INSTALLERS = new Set(['TECHNICIAN', 'SUPERVISOR', 'MUNICIPAL_ADMIN', 'SUPER_ADMIN']);

class InvalidQrError extends Error {}

function Scanner({ onScan }: { onScan: (data: string) => void }) {
  const handling = useRef(false);
  return (
    <View style={styles.cameraFrame}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (!handling.current) {
            handling.current = true;
            onScan(data);
            setTimeout(() => (handling.current = false), 1500);
          }
        }}
      />
    </View>
  );
}

export default function ScanScreen() {
  const { messages: m, format } = useI18n();
  const { user } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [fitting, setFitting] = useState(false);

  const lookup = useMutation({
    mutationFn: async (data: string) => {
      const code = extractPoleCode(data);
      if (!code) {
        throw new InvalidQrError();
      }
      return api.request<PoleDto>(`/v1/poles/by-code/${encodeURIComponent(code)}`);
    },
  });

  const commission = useMutation({
    mutationFn: async (data: string) => {
      const deviceId = extractDeviceId(data);
      if (!deviceId || !lookup.data) {
        throw new InvalidQrError();
      }
      return api.request<PoleDto>('/v1/devices/commission', {
        method: 'POST',
        body: { poleCode: lookup.data.code, deviceId },
      });
    },
    onSuccess: () => setFitting(false),
  });

  const errorOf = (error: Error | null, invalid: string) =>
    !error
      ? null
      : error instanceof InvalidQrError
        ? invalid
        : error instanceof ApiClientError && error.status === 404
          ? m.scan.notFound
          : error instanceof ApiClientError && error.code === 'DEVICE_OTHER_TENANT'
            ? m.commission.otherCity
            : error instanceof ApiClientError && error.status === 403
              ? m.commission.forbidden
              : m.common.error;

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

  const pole = commission.data ?? lookup.data;
  const lookupError = errorOf(lookup.error, m.scan.invalid);
  const commissionError = errorOf(commission.error, m.commission.invalid);
  const scanningPole = !lookup.data && !lookupError;

  function reset() {
    lookup.reset();
    commission.reset();
    setFitting(false);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      {scanningPole ? (
        <>
          <Text style={{ fontSize: 16, color: colors.muted }}>{m.scan.hint}</Text>
          <Scanner onScan={(data) => lookup.mutate(data)} />
        </>
      ) : null}

      {lookupError ? <Message text={lookupError} /> : null}

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

      {commission.isSuccess && pole?.device ? (
        <Message
          tone="success"
          text={format(m.commission.done, { device: pole.device.deviceId })}
        />
      ) : null}

      {pole && !fitting && user && INSTALLERS.has(user.role) ? (
        <AppButton
          label={pole.device ? m.commission.replace : m.commission.fit}
          variant="outline"
          onPress={() => {
            commission.reset();
            setFitting(true);
          }}
        />
      ) : null}

      {fitting ? (
        <Card>
          <Text style={{ fontSize: 16, color: colors.muted }}>{m.commission.hint}</Text>
          {commissionError ? <Message text={commissionError} /> : null}
          {commission.isPending ? (
            <Text style={{ color: colors.muted }}>{m.common.loading}</Text>
          ) : (
            <Scanner onScan={(data) => commission.mutate(data)} />
          )}
          <AppButton label={m.job.cancel} variant="ghost" onPress={() => setFitting(false)} />
        </Card>
      ) : null}

      {!scanningPole ? <AppButton label={m.scan.again} variant="outline" onPress={reset} /> : null}
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
