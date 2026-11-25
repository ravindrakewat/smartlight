/**
 * IoT worker process (Render "Background Worker"): runs the MQTT bridge that
 * ingests controller messages and delivers queued commands. Shares all business
 * logic with the API; only the entry point differs.
 *
 *   npm run start:worker -w @smart-light/api
 */
import { env } from './config/env';
import { startChirpstackBridge } from './iot/chirpstack-bridge';
import { startMqttBridge } from './iot/mqtt-bridge';
import { prisma } from './lib/prisma';
import { logger } from './utils/logger';

if (!env.MQTT_URL && !env.CHIRPSTACK_MQTT_URL) {
  logger.error('Neither MQTT_URL nor CHIRPSTACK_MQTT_URL is set; the IoT worker has nothing to do');
  process.exit(1);
}

// Wi-Fi / 4G controllers (JSON over MQTT).
const bridge = env.MQTT_URL
  ? startMqttBridge({
      url: env.MQTT_URL,
      clientId: env.MQTT_CLIENT_ID,
      ...(env.MQTT_USERNAME ? { username: env.MQTT_USERNAME } : {}),
      ...(env.MQTT_PASSWORD ? { password: env.MQTT_PASSWORD } : {}),
    })
  : null;

// LoRaWAN controllers through ChirpStack v4: an additional link, not a replacement.
const lorawan = env.CHIRPSTACK_MQTT_URL
  ? startChirpstackBridge({
      url: env.CHIRPSTACK_MQTT_URL,
      clientId: `${env.MQTT_CLIENT_ID}-chirpstack`,
      ...(env.CHIRPSTACK_MQTT_USERNAME ? { username: env.CHIRPSTACK_MQTT_USERNAME } : {}),
      ...(env.CHIRPSTACK_MQTT_PASSWORD ? { password: env.CHIRPSTACK_MQTT_PASSWORD } : {}),
    })
  : null;

logger.info('IoT worker started', {
  environment: env.NODE_ENV,
  mqtt: Boolean(bridge),
  lorawan: Boolean(lorawan),
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;
  logger.info('IoT worker stopping', { signal });
  const timer = setTimeout(() => process.exit(1), 10_000);
  timer.unref();
  await bridge?.stop().catch(() => undefined);
  await lorawan?.stop().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
