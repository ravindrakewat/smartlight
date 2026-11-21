import { createPrismaClient, type PrismaClient } from '@smart-light/db';
import { env } from '../config/env';

/** The single database client for this process. */
export const prisma: PrismaClient = createPrismaClient(env.DATABASE_URL, {
  maxConnections: env.DATABASE_POOL_MAX,
});

/** Transaction client type, for repository functions that may run inside `$transaction`. */
export type DbClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;
