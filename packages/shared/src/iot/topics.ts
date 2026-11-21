/**
 * MQTT topic hierarchy shared by firmware, the MQTT ingestion worker and the API.
 *
 *   sl/v1/{tenantId}/{deviceId}/{channel}
 *
 * The broker ACL must restrict each device credential to its own
 * `sl/v1/{tenantId}/{deviceId}/#` subtree so one controller can never publish as another.
 * Keep in sync with firmware/street-light-controller/main/include/sl_protocol.h.
 */

export const MQTT_TOPIC_ROOT = 'sl';
export const MQTT_PROTOCOL_VERSION = 'v1';

export enum DeviceTopicChannel {
  /** Device → cloud. Periodic electrical and environmental readings. QoS 0. */
  Telemetry = 'telemetry',
  /** Device → cloud. Retained online/offline state; `offline` is the MQTT Last Will. QoS 1. */
  Status = 'status',
  /** Device → cloud. Faults and notable events (lamp failure, motion). QoS 1. */
  Event = 'event',
  /** Cloud → device. Control commands. QoS 1. */
  Command = 'cmd',
  /** Device → cloud. Command acknowledgements and results. QoS 1. */
  CommandAck = 'cmd/ack',
}

/** Tenant and device identifiers: lowercase letters, digits and hyphens only (MQTT-safe). */
export const MQTT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

export function buildDeviceTopic(
  tenantId: string,
  deviceId: string,
  channel: DeviceTopicChannel,
): string {
  if (!MQTT_ID_PATTERN.test(tenantId) || !MQTT_ID_PATTERN.test(deviceId)) {
    throw new Error('tenantId and deviceId must match MQTT_ID_PATTERN');
  }
  return `${MQTT_TOPIC_ROOT}/${MQTT_PROTOCOL_VERSION}/${tenantId}/${deviceId}/${channel}`;
}

export interface ParsedDeviceTopic {
  tenantId: string;
  deviceId: string;
  channel: DeviceTopicChannel;
}

const CHANNELS = new Set<string>(Object.values(DeviceTopicChannel));

/** Parses an incoming topic; returns `null` for anything outside the v1 hierarchy. */
export function parseDeviceTopic(topic: string): ParsedDeviceTopic | null {
  const [root, version, tenantId, deviceId, ...rest] = topic.split('/');
  const channel = rest.join('/');

  if (
    root !== MQTT_TOPIC_ROOT ||
    version !== MQTT_PROTOCOL_VERSION ||
    tenantId === undefined ||
    deviceId === undefined ||
    !MQTT_ID_PATTERN.test(tenantId) ||
    !MQTT_ID_PATTERN.test(deviceId) ||
    !CHANNELS.has(channel)
  ) {
    return null;
  }

  return { tenantId, deviceId, channel: channel as DeviceTopicChannel };
}
