/**
 * LoRaWAN (ChirpStack v4) → platform.
 *
 * Uplinks are processed once (unique `deduplicationId`), mapped from DevEUI to the
 * controller, decoded from compact frames into the v1 payloads and handed to the
 * same ingest pipeline as Wi-Fi / 4G messages. Radio metadata (RSSI, SNR,
 * gateways) is stored as reported by the network server. Whether a device or
 * gateway is simulated comes from the registry, never from the message.
 *
 * Command states for LoRaWAN downlinks:
 *   PENDING (queued here) → SENT + sentAt (enqueued at the network server)
 *   → transmittedAt (a gateway transmitted it; ChirpStack `txack`)
 *   → ackAt (the device's radio confirmed receipt; ChirpStack `ack`)
 *   → ACCEPTED/COMPLETED + appliedAt (the controller's own port-30 acknowledgement).
 * The lamp state shown on screens comes only from telemetry.
 */
import { Prisma } from '@smart-light/db';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  decodeLorawanCommandAck,
  decodeLorawanEvent,
  decodeLorawanTelemetry,
  DeviceTopicChannel,
  encodeLorawanCommand,
  IOT_SCHEMA_VERSION,
  LorawanDecodeError,
  LorawanPort,
  NetworkInterface,
  type LorawanCommand,
} from '@smart-light/shared';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { recordAuditSafely } from '../audit/audit.service';
import { ingestService, type IngestOutcome } from '../iot/ingest.service';
import {
  chirpstackAckSchema,
  chirpstackDownlinkTopic,
  chirpstackJoinSchema,
  chirpstackTxAckSchema,
  chirpstackUplinkSchema,
  type ChirpstackEventName,
  type ChirpstackUplink,
} from './chirpstack.schemas';

export type LorawanOutcome =
  IngestOutcome | 'decode_error' | 'topic_mismatch' | 'joined' | 'command_updated';

const registryInclude = {
  interface: {
    select: {
      id: true,
      device: { select: { id: true, tenantId: true, firmwareVersion: true } },
    },
  },
} satisfies Prisma.LorawanDeviceInclude;

function findRegistered(devEui: string) {
  return prisma.lorawanDevice.findUnique({ where: { devEui }, include: registryInclude });
}

/** The strongest reception among the gateways that heard the frame. */
function bestReception(up: ChirpstackUplink) {
  let best: (typeof up.rxInfo)[number] | undefined;
  for (const rx of up.rxInfo) {
    if (rx.rssi !== undefined && (best?.rssi === undefined || rx.rssi > best.rssi)) {
      best = rx;
    }
  }
  return best ?? up.rxInfo[0];
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Frame → v1 payload for the ingest pipeline, or the reason it cannot be used. */
function toPayload(
  up: ChirpstackUplink,
  bytes: Uint8Array,
  firmwareVersion: string | null,
  rssiDbm: number | undefined,
):
  | { channel: DeviceTopicChannel; payload: unknown }
  | { error: 'decode_error' | 'ignored'; reason?: string } {
  try {
    switch (up.fPort) {
      case LorawanPort.Telemetry: {
        const frame = decodeLorawanTelemetry(bytes);
        if (rssiDbm === undefined) {
          return { error: 'decode_error', reason: 'No reception metadata' };
        }
        return {
          channel: DeviceTopicChannel.Telemetry,
          payload: {
            v: IOT_SCHEMA_VERSION,
            ts: frame.ts,
            seq: up.fCnt,
            lamp: { on: frame.lampOn, dimPercent: frame.dimPercent, mode: frame.mode },
            electrical: {
              voltageV: frame.voltageV,
              currentA: frame.currentA,
              powerW: frame.powerW,
              energyWh: frame.energyWh,
            },
            environment: {
              motionDetected: frame.motionDetected,
              ...(frame.isDark === undefined ? {} : { isDark: frame.isDark }),
            },
            device: {
              // Not in the compact frame; the last value the controller reported.
              firmwareVersion: firmwareVersion ?? 'unknown',
              uptimeSec: frame.uptimeSec,
              network: NetworkInterface.Lorawan,
              rssiDbm: Math.max(-140, Math.min(0, Math.round(rssiDbm))),
              ...(frame.boardTempC === undefined ? {} : { boardTempC: frame.boardTempC }),
            },
          },
        };
      }
      case LorawanPort.Event: {
        const frame = decodeLorawanEvent(bytes);
        return {
          channel: DeviceTopicChannel.Event,
          payload: {
            v: IOT_SCHEMA_VERSION,
            ts: frame.ts,
            seq: up.fCnt,
            type: frame.type,
            severity: frame.severity,
            ...(frame.clears ? { clears: frame.clears } : {}),
          },
        };
      }
      case LorawanPort.CommandAck: {
        const frame = decodeLorawanCommandAck(bytes);
        return {
          channel: DeviceTopicChannel.CommandAck,
          payload: {
            v: IOT_SCHEMA_VERSION,
            ts: Math.floor(Date.now() / 1000),
            cmdId: frame.cmdId,
            status: frame.status,
          },
        };
      }
      default:
        return { error: 'ignored', reason: `Unused port ${up.fPort ?? 'none'}` };
    }
  } catch (error) {
    if (error instanceof LorawanDecodeError) {
      return { error: 'decode_error', reason: error.message };
    }
    throw error;
  }
}

async function handleUplink(raw: unknown, topicDevEui: string): Promise<LorawanOutcome> {
  const parsed = chirpstackUplinkSchema.safeParse(raw);
  if (!parsed.success) {
    return 'invalid_payload';
  }
  const up = parsed.data;
  if (up.deviceInfo.devEui !== topicDevEui) {
    return 'topic_mismatch';
  }
  const registered = await findRegistered(up.deviceInfo.devEui);
  const device = registered?.interface.device ?? null;
  const rx = bestReception(up);
  const bytes = up.data ? base64ToBytes(up.data) : new Uint8Array();
  const receivedAt = up.time ? new Date(up.time) : new Date();
  const converted = device
    ? toPayload(up, bytes, device.firmwareVersion, rx?.rssi)
    : ({ error: 'unknown_device' } as const);

  // Idempotency: the deduplication id is unique; a redelivery stops here.
  try {
    await prisma.lorawanUplink.create({
      data: {
        deduplicationId: up.deduplicationId,
        devEui: up.deviceInfo.devEui,
        deviceId: device?.id ?? null,
        fCnt: up.fCnt,
        fPort: up.fPort ?? null,
        receivedAt,
        rssiDbm: rx?.rssi ?? null,
        snrDb: rx?.snr ?? null,
        gatewayEui: rx?.gatewayId ?? null,
        gatewayCount: up.rxInfo.length,
        dataRate: up.dr ?? null,
        frequencyHz: up.txInfo?.frequency ?? null,
        payloadHex: bytes.length > 0 ? bytesToHex(bytes) : null,
        result: 'error' in converted ? converted.error : 'ok',
        isSimulated: registered?.isSimulated ?? false,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return 'duplicate';
    }
    throw error;
  }

  // Gateways that heard it are alive (registered gateways only).
  const gatewayIds = [...new Set(up.rxInfo.map((info) => info.gatewayId))];
  if (gatewayIds.length > 0) {
    await prisma.gateway.updateMany({
      where: { gatewayEui: { in: gatewayIds } },
      data: { online: true, lastSeenAt: receivedAt },
    });
  }

  if (!registered || !device) {
    logger.warn('LoRaWAN uplink from an unregistered DevEUI', { devEui: up.deviceInfo.devEui });
    return 'unknown_device';
  }

  if (registered.lastFCntUp !== null && up.fCnt < registered.lastFCntUp) {
    // A frame counter going back means a rejoin or a reset device; worth a look.
    logger.warn('LoRaWAN frame counter went back', {
      devEui: up.deviceInfo.devEui,
      previous: registered.lastFCntUp,
      now: up.fCnt,
    });
  }
  await prisma.$transaction([
    prisma.lorawanDevice.update({
      where: { id: registered.id },
      data: {
        lastFCntUp: up.fCnt,
        lastUplinkAt: receivedAt,
        // Any uplink proves the device has joined.
        ...(registered.joinStatus === 'JOINED' ? {} : { joinStatus: 'JOINED' }),
      },
    }),
    prisma.deviceInterface.update({
      where: { id: registered.interface.id },
      data: {
        lastSeenAt: receivedAt,
        lastRssiDbm: rx?.rssi ?? null,
        lastSnrDb: rx?.snr ?? null,
      },
    }),
    prisma.device.update({
      where: { id: device.id },
      data: { online: true, lastSeenAt: receivedAt },
    }),
  ]);

  if ('error' in converted) {
    if (converted.error === 'decode_error') {
      logger.warn('LoRaWAN frame could not be decoded', {
        devEui: up.deviceInfo.devEui,
        fPort: up.fPort,
        reason: converted.reason,
      });
    }
    return converted.error;
  }
  return ingestService.handleForDevice(device.id, converted.channel, converted.payload, {
    via: 'lorawan',
    ...(rx?.snr === undefined ? {} : { snrDb: rx.snr }),
  });
}

async function handleJoin(raw: unknown, topicDevEui: string): Promise<LorawanOutcome> {
  const parsed = chirpstackJoinSchema.safeParse(raw);
  if (!parsed.success) return 'invalid_payload';
  const join = parsed.data;
  if (join.deviceInfo.devEui !== topicDevEui) return 'topic_mismatch';
  const registered = await findRegistered(join.deviceInfo.devEui);
  if (!registered) return 'unknown_device';
  const joinedAt = join.time ? new Date(join.time) : new Date();
  await prisma.lorawanDevice.update({
    where: { id: registered.id },
    // A rejoin resets the frame counters.
    data: { joinStatus: 'JOINED', joinedAt, lastFCntUp: null },
  });
  await recordAuditSafely({
    tenantId: registered.interface.device.tenantId,
    actorType: 'DEVICE',
    actorId: join.deviceInfo.devEui,
    action: 'lorawan.join',
    entityType: 'device',
    entityId: registered.interface.device.id,
    metadata: { simulated: registered.isSimulated },
  });
  return 'joined';
}

async function handleTxAck(raw: unknown): Promise<LorawanOutcome> {
  const parsed = chirpstackTxAckSchema.safeParse(raw);
  if (!parsed.success) return 'invalid_payload';
  const updated = await prisma.deviceCommand.updateMany({
    where: { downlinkId: parsed.data.queueItemId, channel: 'lorawan', transmittedAt: null },
    data: { transmittedAt: parsed.data.time ? new Date(parsed.data.time) : new Date() },
  });
  return updated.count > 0 ? 'command_updated' : 'ignored';
}

async function handleNetworkAck(raw: unknown): Promise<LorawanOutcome> {
  const parsed = chirpstackAckSchema.safeParse(raw);
  if (!parsed.success) return 'invalid_payload';
  const ack = parsed.data;
  const command = await prisma.deviceCommand.findFirst({
    where: { downlinkId: ack.queueItemId, channel: 'lorawan' },
  });
  if (!command) return 'ignored';
  if (ack.acknowledged) {
    // The radio confirmed receipt; "applied" waits for the controller's port-30 ack.
    await prisma.deviceCommand.updateMany({
      where: { id: command.id, ackAt: null },
      data: { ackAt: ack.time ? new Date(ack.time) : new Date() },
    });
  } else if (command.status === 'SENT') {
    await prisma.deviceCommand.update({
      where: { id: command.id },
      data: { status: 'FAILED', reason: 'The device did not confirm the downlink' },
    });
  }
  return 'command_updated';
}

export const lorawanService = {
  /** One ChirpStack integration event (topic already parsed). */
  async handleEvent(
    event: ChirpstackEventName,
    devEui: string,
    payload: unknown,
  ): Promise<LorawanOutcome> {
    switch (event) {
      case 'up':
        return handleUplink(payload, devEui);
      case 'join':
        return handleJoin(payload, devEui);
      case 'txack':
        return handleTxAck(payload);
      case 'ack':
        return handleNetworkAck(payload);
      default:
        return 'ignored';
    }
  },

  /**
   * The downlink for a queued LoRaWAN command: topic and ChirpStack payload.
   * The queue item id is the command id, so txack / ack events map back to it.
   * Returns null (with a reason) when the command cannot go over LoRaWAN.
   */
  async buildDownlink(
    commandId: string,
  ): Promise<
    { topic: string; message: Record<string, unknown>; devEui: string } | { error: string }
  > {
    const command = await prisma.deviceCommand.findUnique({
      where: { id: commandId },
      include: {
        device: {
          select: {
            interfaces: {
              where: { kind: 'LORAWAN', enabled: true },
              select: { lorawan: { select: { devEui: true, joinStatus: true } } },
            },
          },
        },
      },
    });
    const lorawan = command?.device.interfaces[0]?.lorawan;
    if (!command || !lorawan) {
      return { error: 'No enabled LoRaWAN link' };
    }
    const payload = command.payload as Record<string, unknown>;
    let frame: LorawanCommand;
    if (payload['action'] === 'set_output') {
      frame = {
        cmdId: command.id,
        action: 'set_output',
        on: payload['on'] === true,
        dimPercent: Number(payload['dimPercent']),
        overrideUntil: Number(payload['overrideUntil']),
        expiresAt: Number(payload['expiresAt']),
      };
    } else if (payload['action'] === 'set_auto') {
      frame = { cmdId: command.id, action: 'set_auto', expiresAt: Number(payload['expiresAt']) };
    } else {
      return { error: `${String(payload['action'])} cannot be sent over LoRaWAN` };
    }
    const applicationId = env.CHIRPSTACK_APPLICATION_ID;
    if (!applicationId) {
      return { error: 'CHIRPSTACK_APPLICATION_ID is not configured' };
    }
    return {
      devEui: lorawan.devEui,
      topic: chirpstackDownlinkTopic(applicationId, lorawan.devEui),
      message: {
        id: command.id,
        devEui: lorawan.devEui,
        confirmed: true,
        fPort: LorawanPort.Command,
        data: bytesToBase64(encodeLorawanCommand(frame)),
      },
    };
  },
};
