/**
 * IoT worker process (Render "Background Worker"): runs the MQTT bridge that
 * ingests controller messages and delivers queued commands. Shares all business
 * logic with the API; only the entry point differs.
 *
 *   npm run start:worker -w @smart-light/api
 */
import { env } from './config/env';
import { startMqttBridge } from './iot/mqtt-bridge';
import { prisma } from './lib/prisma';
import { logger } from './utils/logger';

if (!env.MQTT_URL) {
  logger.error('MQTT_URL is not set; the IoT worker has nothing to connect to');
  process.exit(1);
}

const bridge = startMqttBridge({
  url: env.MQTT_URL,
  clientId: env.MQTT_CLIENT_ID,
  ...(env.MQTT_USERNAME ? { username: env.MQTT_USERNAME } : {}),
  ...(env.MQTT_PASSWORD ? { password: env.MQTT_PASSWORD } : {}),
});

logger.info('IoT worker started', { environment: env.NODE_ENV });

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;
  logger.info('IoT worker stopping', { signal });
  const timer = setTimeout(() => process.exit(1), 10_000);
  timer.unref();
  await bridge.stop().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
