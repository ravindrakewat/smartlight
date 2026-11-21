#!/usr/bin/env node
/**
 * Local PostgreSQL for development — no Docker required.
 * Runs a real PostgreSQL 17 server from npm binaries (embedded-postgres).
 *
 *   npm run db:dev        (keep this terminal open)
 *
 * Connection: postgresql://smart_light:smart_light_dev@localhost:5433/smart_light_dev
 * These credentials are for a throwaway local database only.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '.pgdata');
const port = Number(process.env.DEV_DB_PORT ?? 5433);
const database = process.env.DEV_DB_NAME ?? 'smart_light_dev';

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'smart_light',
  password: 'smart_light_dev',
  port,
  persistent: true,
  // UTF-8 regardless of the OS locale (Windows defaults to WIN1252, which cannot store Hindi).
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
});

if (!existsSync(join(dataDir, 'PG_VERSION'))) {
  console.log('Initialising local PostgreSQL data directory…');
  await pg.initialise();
}
await pg.start();

try {
  await pg.createDatabase(database);
  console.log(`Created database "${database}"`);
} catch {
  /* Already exists. */
}

console.log(
  `PostgreSQL ready: postgresql://smart_light:smart_light_dev@localhost:${port}/${database}`,
);
console.log('Press Ctrl+C to stop.');

const shutdown = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);
