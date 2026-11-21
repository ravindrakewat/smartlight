import type { DbClient } from './prisma';

export type CounterName = 'pole' | 'complaint' | 'work_order';

/**
 * Atomically returns the next value of a per-tenant counter. A single
 * INSERT … ON CONFLICT statement is safe under concurrency, so two requests can
 * never receive the same pole serial or reference number.
 */
export async function nextCounterValue(
  db: DbClient,
  tenantId: string,
  name: CounterName,
): Promise<number> {
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "tenant_counters" ("tenantId", "name", "value")
    VALUES (${tenantId}::uuid, ${name}, 1)
    ON CONFLICT ("tenantId", "name")
    DO UPDATE SET "value" = "tenant_counters"."value" + 1
    RETURNING "value"`;
  const value = rows[0]?.value;
  if (value === undefined) {
    throw new Error(`Counter ${name} returned no value`);
  }
  return value;
}

const REFERENCE_LETTERS = { complaint: 'C', work_order: 'W' } as const;

/** Human reference number, e.g. `IND-C-000123` (complaint) or `IND-W-000045` (work order). */
export async function nextReference(
  db: DbClient,
  tenant: { id: string; code: string },
  name: 'complaint' | 'work_order',
): Promise<string> {
  const value = await nextCounterValue(db, tenant.id, name);
  return `${tenant.code}-${REFERENCE_LETTERS[name]}-${String(value).padStart(6, '0')}`;
}
