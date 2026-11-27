/**
 * ChirpStack v4 bridge (LoRaWAN), in the worker process next to the MQTT bridge.
 *
 * Inbound:  `application/+/device/+/event/{up,join,ack,txack}` from the ChirpStack
 *           MQTT integration, processed one at a time per DevEUI.
 * Outbound: queued commands whose channel is `lorawan` are encoded as compact
 *           frames and enqueued at ChirpStack (`.../command/down`, confirmed).
 *           Enqueued is not delivered: delivery shows up as txack / ack events later.
 */
import mqtt, { type IClientOptions, type MqttClient } from 'mqtt';
import { prisma } from '../lib/prisma';
import { parseChirpstackTopic } from '../modules/lorawan/chirpstack.schemas';
import { lorawanService } from '../modules/lorawan/lorawan.service';
import { logger } from '../utils/logger';

const MAX_EVENT_BYTES = 64 * 1024;
const OUTBOX_BATCH = 100;

export interface ChirpstackBridgeOptions {
  url: string;
  username?: string;
  password?: string;
  clientId: string;
  outboxIntervalMs?: number;
}

export interface ChirpstackBridge {
  client: MqttClient;
  flushOutbox(): Promise<number>;
  idle(): Promise<void>;
  stop(): Promise<void>;
}

export function startChirpstackBridge(options: ChirpstackBridgeOptions): ChirpstackBridge {
  const clientOptions: IClientOptions = {
    clientId: options.clientId,
    clean: false,
    reconnectPeriod: 5_000,
    connectTimeout: 15_000,
    ...(options.username ? { username: options.username } : {}),
    ...(options.password ? { password: options.password } : {}),
  };
  const client = mqtt.connect(options.url, clientOptions);
  const chains = new Map<string, Promise<void>>();
  let flushing: Promise<number> | null = null;

  client.on('connect', () => {
    logger.info('ChirpStack bridge connected', { clientId: options.clientId });
    client.subscribe('application/+/device/+/event/+', { qos: 1 }, (error) => {
      if (error) logger.error('ChirpStack subscribe failed', { errorMessage: error.message });
    });
    flushOutboxSafely();
  });
  client.on('reconnect', () => logger.warn('ChirpStack bridge reconnecting'));
  client.on('error', (error) =>
    logger.error('ChirpStack MQTT error', {
      errorMessage: error.message,
      code: (error as { code?: string | number }).code,
    }),
  );

  client.on('message', (topic, buffer) => {
    const parsed = parseChirpstackTopic(topic);
    if (!parsed || buffer.length > MAX_EVENT_BYTES) return;
    let payload: unknown;
    try {
      payload = JSON.parse(buffer.toString('utf8'));
    } catch {
      logger.warn('Non-JSON ChirpStack event dropped (use the JSON marshaler)', {
        devEui: parsed.devEui,
      });
      return;
    }
    const previous = chains.get(parsed.devEui) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        await lorawanService.handleEvent(parsed.event, parsed.devEui, payload);
      })
      .catch((error: unknown) => {
        logger.error('LoRaWAN event failed', {
          devEui: parsed.devEui,
          event: parsed.event,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      });
    chains.set(parsed.devEui, next);
    void next.finally(() => {
      if (chains.get(parsed.devEui) === next) chains.delete(parsed.devEui);
    });
  });

  async function publishPending(): Promise<number> {
    if (!client.connected) return 0;
    const pending = await prisma.deviceCommand.findMany({
      where: { status: 'PENDING', channel: 'lorawan', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: OUTBOX_BATCH,
      select: { id: true },
    });
    let sent = 0;
    for (const { id } of pending) {
      const downlink = await lorawanService.buildDownlink(id);
      if ('error' in downlink) {
        await prisma.deviceCommand.updateMany({
          where: { id, status: 'PENDING' },
          data: { status: 'FAILED', reason: downlink.error },
        });
        continue;
      }
      try {
        await client.publishAsync(downlink.topic, JSON.stringify(downlink.message), { qos: 1 });
        await prisma.deviceCommand.updateMany({
          where: { id, status: 'PENDING' },
          data: { status: 'SENT', sentAt: new Date(), downlinkId: id },
        });
        sent++;
      } catch (error) {
        logger.error('LoRaWAN downlink enqueue failed', {
          commandId: id,
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
  // A failed database read must not crash the worker: log it and retry on the next tick.
  function flushOutboxSafely(): void {
    flushOutbox().catch((error: unknown) => {
      logger.warn('LoRaWAN outbox check failed, retrying', {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    });
  }
  const timer = setInterval(flushOutboxSafely, options.outboxIntervalMs ?? 2_000);

  return {
    client,
    flushOutbox,
    async idle() {
      while (chains.size > 0) await Promise.all([...chains.values()]);
    },
    async stop() {
      clearInterval(timer);
      await flushing;
      await Promise.all([...chains.values()]);
      await client.endAsync();
    },
  };
}
