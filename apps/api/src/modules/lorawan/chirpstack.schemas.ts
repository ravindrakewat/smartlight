/**
 * ChirpStack v4 MQTT integration events (JSON marshaler), validated before use:
 * a message on the broker is never trusted as-is.
 *
 * Topic: `application/{applicationId}/device/{devEui}/event/{up|join|ack|txack|status|log}`
 * Downlink: publish to `application/{applicationId}/device/{devEui}/command/down`.
 *
 * Only the fields the platform uses are declared; unknown fields are ignored so a
 * ChirpStack minor upgrade does not break ingestion.
 */
import { z } from 'zod';

const eui = z
  .string()
  .regex(/^[0-9a-fA-F]{16}$/)
  .transform((value) => value.toLowerCase());

export const chirpstackDeviceInfoSchema = z.object({
  tenantId: z.string().optional(),
  applicationId: z.string().min(1),
  deviceProfileName: z.string().optional(),
  deviceName: z.string().optional(),
  devEui: eui,
});

export const chirpstackRxInfoSchema = z.object({
  gatewayId: eui,
  rssi: z.number().int().min(-200).max(50).optional(),
  snr: z.number().min(-50).max(50).optional(),
});

export const chirpstackUplinkSchema = z.object({
  deduplicationId: z.uuid(),
  time: z.iso.datetime({ offset: true }).optional(),
  deviceInfo: chirpstackDeviceInfoSchema,
  devAddr: z.string().optional(),
  dr: z.number().int().min(0).max(15).optional(),
  fCnt: z.number().int().nonnegative(),
  /** Absent for MAC-only frames. */
  fPort: z.number().int().min(0).max(255).optional(),
  confirmed: z.boolean().optional(),
  /** Base64 application payload; absent for empty frames. */
  data: z.string().max(400).optional(),
  rxInfo: z.array(chirpstackRxInfoSchema).max(64).default([]),
  txInfo: z.object({ frequency: z.number().int().positive().optional() }).optional(),
});
export type ChirpstackUplink = z.infer<typeof chirpstackUplinkSchema>;

export const chirpstackJoinSchema = z.object({
  deduplicationId: z.uuid(),
  time: z.iso.datetime({ offset: true }).optional(),
  deviceInfo: chirpstackDeviceInfoSchema,
  devAddr: z.string().optional(),
});
export type ChirpstackJoin = z.infer<typeof chirpstackJoinSchema>;

/** Confirmed downlink acknowledged (or not) by the device's next uplink. */
export const chirpstackAckSchema = z.object({
  time: z.iso.datetime({ offset: true }).optional(),
  deviceInfo: chirpstackDeviceInfoSchema,
  queueItemId: z.string().min(1),
  acknowledged: z.boolean(),
  fCntDown: z.number().int().nonnegative().optional(),
});
export type ChirpstackAck = z.infer<typeof chirpstackAckSchema>;

/** A gateway transmitted the downlink. */
export const chirpstackTxAckSchema = z.object({
  time: z.iso.datetime({ offset: true }).optional(),
  deviceInfo: chirpstackDeviceInfoSchema,
  queueItemId: z.string().min(1),
  fCntDown: z.number().int().nonnegative().optional(),
  gatewayId: eui.optional(),
});
export type ChirpstackTxAck = z.infer<typeof chirpstackTxAckSchema>;

export const CHIRPSTACK_EVENTS = ['up', 'join', 'ack', 'txack'] as const;
export type ChirpstackEventName = (typeof CHIRPSTACK_EVENTS)[number];

/** `application/{appId}/device/{devEui}/event/{event}` → parts, or null. */
export function parseChirpstackTopic(
  topic: string,
): { applicationId: string; devEui: string; event: ChirpstackEventName } | null {
  const match = /^application\/([^/]+)\/device\/([0-9a-fA-F]{16})\/event\/([a-z]+)$/.exec(topic);
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }
  const event = match[3] as ChirpstackEventName;
  if (!(CHIRPSTACK_EVENTS as readonly string[]).includes(event)) {
    return null;
  }
  return { applicationId: match[1], devEui: match[2].toLowerCase(), event };
}

export function chirpstackDownlinkTopic(applicationId: string, devEui: string): string {
  return `application/${applicationId}/device/${devEui}/command/down`;
}
