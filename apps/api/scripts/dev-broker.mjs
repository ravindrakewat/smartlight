// Local MQTT broker for development and demos (no TLS, no auth). Never use in production.
//
//   npm run dev:broker -w @smart-light/api      → mqtt://localhost:1883
import { createServer } from 'node:net';
import { Aedes } from 'aedes';

const port = Number(process.env.MQTT_DEV_PORT ?? 1883);
const broker = await Aedes.createBroker();
const server = createServer(broker.handle);

broker.on('client', (client) => console.log(`connected: ${client.id}`));
broker.on('clientDisconnect', (client) => console.log(`disconnected: ${client.id}`));

server.listen(port, () => console.log(`Dev MQTT broker on mqtt://localhost:${port}`));

const stop = () => broker.close(() => server.close(() => process.exit(0)));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
