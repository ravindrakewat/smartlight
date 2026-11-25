// Bench helper: talk to one controller over the dev broker without the database or worker.
// Run from the repo root (uses the workspace's `mqtt` package):
//
//   node firmware/bench-tests/driver-rgbw-test/tools/mqtt-bench.mjs watch
//   node firmware/bench-tests/driver-rgbw-test/tools/mqtt-bench.mjs on 60     (ON at 60 %, 10 min)
//   node firmware/bench-tests/driver-rgbw-test/tools/mqtt-bench.mjs off
//   node firmware/bench-tests/driver-rgbw-test/tools/mqtt-bench.mjs auto
//   node firmware/bench-tests/driver-rgbw-test/tools/mqtt-bench.mjs reboot
//
// Env: MQTT_URL (default mqtt://localhost:1883), TENANT (indore-mc), DEVICE (sl-000001).
import { randomUUID } from 'node:crypto';
import mqtt from 'mqtt';

const url = process.env.MQTT_URL ?? 'mqtt://localhost:1883';
const base = `sl/v1/${process.env.TENANT ?? 'indore-mc'}/${process.env.DEVICE ?? 'sl-000001'}`;
const [action = 'watch', arg] = process.argv.slice(2);

const now = Math.floor(Date.now() / 1000);
const command = { v: 1, cmdId: randomUUID(), issuedAt: now, expiresAt: now + 300 };
const commands = {
  on: { action: 'set_output', on: true, dimPercent: Number(arg ?? 100), overrideUntil: now + 600 },
  off: { action: 'set_output', on: false, dimPercent: 0, overrideUntil: now + 600 },
  auto: { action: 'set_auto' },
  reboot: { action: 'reboot' },
};
if (action !== 'watch' && !commands[action]) {
  console.error('Usage: mqtt-bench.mjs watch | on [dim%] | off | auto | reboot');
  process.exit(1);
}

const client = mqtt.connect(url, { clientId: `bench-tool-${process.pid}` });
client.on('error', (error) => {
  console.error(`Broker ${url}: ${error.message}`);
  process.exit(1);
});
client.on('connect', () => {
  client.subscribe(`${base}/#`, { qos: 1 });
  console.log(`Connected to ${url}, watching ${base}/#`);
  if (action !== 'watch') {
    const payload = JSON.stringify({ ...command, ...commands[action] });
    client.publish(`${base}/cmd`, payload, { qos: 1 });
    console.log(`-> cmd ${payload}`);
  }
});
client.on('message', (topic, payload) => {
  const channel = topic.slice(base.length + 1);
  if (channel === 'cmd') return;
  console.log(`<- ${channel} ${payload.toString()}`);
  if (channel === 'cmd/ack' && action !== 'watch') {
    const ack = JSON.parse(payload.toString());
    if (ack.cmdId === command.cmdId) setTimeout(() => client.end(), 1500);
  }
});
