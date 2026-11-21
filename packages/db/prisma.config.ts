import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * DATABASE_URL comes from packages/db/.env locally (see .env.example) and from the
 * environment on Render. `prisma generate` does not need a database.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
