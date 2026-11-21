import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';

export interface CreatePrismaClientOptions {
  /** Maximum pooled connections (Render starter Postgres allows ~97 in total). */
  maxConnections?: number;
}

/**
 * Creates a Prisma client backed by the `pg` driver. Create ONE per process and
 * reuse it; call `$disconnect()` on shutdown.
 */
export function createPrismaClient(
  databaseUrl: string,
  options: CreatePrismaClientOptions = {},
): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: options.maxConnections ?? 10,
  });
  return new PrismaClient({ adapter });
}
export { hashPassword, verifyPassword } from './security/password';
