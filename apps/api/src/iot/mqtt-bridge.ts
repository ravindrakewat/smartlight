/**
 * MQTT bridge: the only part of the platform that talks to the broker.
 *
 * Inbound:  subscribes to every controller's telemetry/status/event/ack topics
 *           and hands each message to the ingest service, one message at a time
 *           per controller (so a fault and its clearance stay in order).
 * Outbound: publishes queued commands from the device_commands outbox (QoS 1),
 *           marks them SENT and expires the ones nobody acknowledged in time.
 *
 * Runs in the worker process (src/worker.ts), never inside the HTTP API.
 */
import mqtt, { type IClientOptions, type MqttClient } from 'mqtt';
import {
  buildDeviceTopic,
  DeviceTopicChannel,
  MQTT_PROTOCOL_VERSION,
  MQTT_TOPIC_ROOT,
  parseDeviceTopic,
} from '@smart-light/shared';
import { prisma } from '../lib/prisma';
import { ingestService } from '../modules/iot/ingest.service';
import { logger } from '../utils/logger';

/** Controllers send small JSON documents; anything bigger is not ours. */
const MAX_PAYLOAD_BYTES = 16 * 1024;
const OUTBOX_BATCH = 200;
const EXPIRY_INTERVAL_MS = 60_000;

const INBOUND_CHANNELS = [
  DeviceTopicChannel.Telemetry,
  DeviceTopicChannel.Status,
  DeviceTopicChannel.Event,
  DeviceTopicChannel.CommandAck,
];

export interface MqttBridgeOptions {
  url: string;
  username?: string;
  password?: string;
  /** Fixed id + persistent session: messages that arrive during a restart are kept. */
  clientId: string;
  outboxIntervalMs?: number;
}

export interface MqttBridge {
  client: MqttClient;
  /** Publishes queued commands now (also runs on a timer). */
  flushOutbox(): Promise<number>;
  /** Resolves when every message received so far has been processed. */
  idle(): Promise<void>;
  stop(): Promise<void>;
}

export function startMqttBridge(options: MqttBridgeOptions): MqttBridge {
  const clientOptions: IClientOptions = {
    clientId: options.clientId,
    clean: false,
    reconnectPeriod: 5_000,
    connectTimeout: 15_000,
    ...(options.username ? { username: options.username } : {}),
    ...(options.password ? { password: options.password } : {}),
  };
  const client = mqtt.connect(options.url, clientOptions);

  /** Per-controller processing chains keep each controller's messages in order. */
  const chains = new Map<string, Promise<void>>();
  let flushing: Promise<number> | null = null;

  client.on('connect', () => {
    logger.info('MQTT bridge connected', { clientId: options.clientId });
    const topics = INBOUND_CHANNELS.map(
      (channel) => `${MQTT_TOPIC_ROOT}/${MQTT_PROTOCOL_VERSION}/+/+/${channel}`,
    );
    client.subscribe(topics, { qos: 1 }, (error) => {
      if (error) {
        logger.error('MQTT subscribe failed', { errorMessage: error.message });
      }
    });
    void flushOutbox();
  });
  client.on('reconnect', () => logger.warn('MQTT bridge reconnecting'));
  client.on('error', (error) => logger.error('MQTT error', { errorMessage: error.message }));

  client.on('message', (topic, buffer) => {
    const parsed = parseDeviceTopic(topic);
    if (!parsed || buffer.length > MAX_PAYLOAD_BYTES) {
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(buffer.toString('utf8'));
    } catch {
      logger.warn('Non-JSON controller message dropped', { deviceId: parsed.deviceId });
      return;
    }
    const key = parsed.deviceId;
    const previous = chains.get(key) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        await ingestService.handle(parsed.tenantId, parsed.deviceId, parsed.channel, payload);
      })
      .catch((error: unknown) => {
        logger.error('Controller message failed', {
          deviceId: parsed.deviceId,
          channel: parsed.channel,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      });
    chains.set(key, next);
    void next.finally(() => {
      if (chains.get(key) === next) {
        chains.delete(key);
      }
    });
  });

  async function publishPending(): Promise<number> {
    if (!client.connected) {
      return 0;
    }
    const pending = await prisma.deviceCommand.findMany({
      where: { status: 'PENDING', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: OUTBOX_BATCH,
      include: { device: { select: { deviceId: true, tenant: { select: { slug: true } } } } },
    });
    let sent = 0;
    for (const command of pending) {
      const topic = buildDeviceTopic(
        command.device.tenant.slug,
        command.device.deviceId,
        DeviceTopicChannel.Command,
      );
      try {
        await client.publishAsync(topic, JSON.stringify(command.payload), { qos: 1 });
        await prisma.deviceCommand.updateMany({
          where: { id: command.id, status: 'PENDING' },
          data: { status: 'SENT', sentAt: new Date() },
        });
        sent++;
      } catch (error) {
        logger.error('Command publish failed', {
          commandId: command.id,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }
    return sent;
  }

  function flushOutbox(): Promise<number> {
    flushing ??= publishPending().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  const outboxTimer = setInterval(() => void flushOutbox(), options.outboxIntervalMs ?? 1_500);
  const expiryTimer = setInterval(() => {
    void ingestService.expireCommands().catch(() => undefined);
  }, EXPIRY_INTERVAL_MS);

  return {
    client,
    flushOutbox,
    async idle() {
      while (chains.size > 0) {
        await Promise.all([...chains.values()]);
      }
    },
    async stop() {
      clearInterval(outboxTimer);
      clearInterval(expiryTimer);
      await flushing;
      await Promise.all([...chains.values()]);
      await client.endAsync();
    },
  };
}
