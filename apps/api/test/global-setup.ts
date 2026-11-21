import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const DB_PACKAGE_DIR = resolve(__dirname, '../../../packages/db');

function migrate(databaseUrl: string): void {
  execSync('npx prisma migrate deploy', {
    cwd: DB_PACKAGE_DIR,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}

/**
 * Starts a throwaway PostgreSQL for the integration tests (no Docker needed) and
 * applies all migrations. Set TEST_DATABASE_URL to use an existing database instead.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const external = process.env['TEST_DATABASE_URL'];
  if (external) {
    process.env['DATABASE_URL'] = external;
    migrate(external);
    return async () => {};
  }

  const dataDir = mkdtempSync(join(tmpdir(), 'sl-test-pg-'));
  const port = 55_000 + Math.floor(Math.random() * 5_000);
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'sl_test',
    password: 'sl_test',
    port,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('sl_test');

  const databaseUrl = `postgresql://sl_test:sl_test@localhost:${port}/sl_test`;
  process.env['DATABASE_URL'] = databaseUrl;
  migrate(databaseUrl);

  return async () => {
    await pg.stop();
    rmSync(dataDir, { recursive: true, force: true });
  };
}
