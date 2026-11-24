/**
 * Normalises wards: turns each distinct free-text `poles.ward` value (e.g.
 * "Ward 36") into a `wards` record per municipality and links the poles to it.
 *
 * Safe by design:
 *  - dry run by default; `--apply` writes;
 *  - never changes or clears `poles.ward` (the original text stays);
 *  - only fills `poles.wardId` where it is still empty;
 *  - re-running does nothing new.
 *
 * Optional `--mark-demo-simulated` flags controllers on DEMO-* zone poles as
 * simulator devices (`devices.isSimulated = true`) so screens never present them
 * as installed hardware.
 *
 *   npm run map:wards -w @smart-light/db                      (dry run, DATABASE_URL)
 *   npm run map:wards -w @smart-light/db -- --apply
 *
 * Production is not a target of this script without the owner's approval.
 */
import { config as loadEnv } from 'dotenv';
import { createPrismaClient } from '../src';

loadEnv({ quiet: true });
const apply = process.argv.includes('--apply');
const markDemo = process.argv.includes('--mark-demo-simulated');
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('DATABASE_URL is not set (copy packages/db/.env.example to .env).');
  process.exit(1);
}

/** "Ward 36", "ward no. 36", "W-36", "36" → "36"; anything else keeps its trimmed text. */
function wardCode(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  const number = /^(?:ward|w)?\s*(?:no\.?|number|#)?\s*[-:]?\s*(\d{1,4})$/i.exec(trimmed);
  return number?.[1] ? String(Number(number[1])) : trimmed;
}

async function main(): Promise<void> {
  const prisma = createPrismaClient(databaseUrl as string, { maxConnections: 2 });
  const host = new URL(databaseUrl as string).hostname;
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} on database host ${host}\n`);
  try {
    const groups = await prisma.pole.groupBy({
      by: ['tenantId', 'ward'],
      where: { ward: { not: null }, wardId: null },
      _count: { _all: true },
    });
    let wardsCreated = 0;
    let polesLinked = 0;
    for (const group of groups) {
      const text = group.ward?.trim();
      if (!text) continue;
      const code = wardCode(text);
      const name = /^\d+$/.test(code) ? `Ward ${code}` : text;
      const existing = await prisma.ward.findUnique({
        where: { tenantId_code: { tenantId: group.tenantId, code } },
      });
      console.log(
        `${existing ? 'link' : 'new '} ward ${code.padEnd(6)} "${text}" → ${group._count._all} poles`,
      );
      if (!apply) {
        wardsCreated += existing ? 0 : 1;
        polesLinked += group._count._all;
        continue;
      }
      const ward =
        existing ?? (await prisma.ward.create({ data: { tenantId: group.tenantId, code, name } }));
      if (!existing) wardsCreated++;
      const linked = await prisma.pole.updateMany({
        where: { tenantId: group.tenantId, ward: group.ward, wardId: null },
        data: { wardId: ward.id },
      });
      polesLinked += linked.count;
    }
    console.log(`\nWards ${apply ? 'created' : 'to create'}: ${wardsCreated}`);
    console.log(`Poles ${apply ? 'linked' : 'to link'}: ${polesLinked}`);

    if (markDemo) {
      const where = { isSimulated: false, pole: { zone: { code: { startsWith: 'DEMO-' } } } };
      const count = await prisma.device.count({ where });
      if (apply) {
        await prisma.device.updateMany({ where, data: { isSimulated: true } });
      }
      console.log(`Demo controllers ${apply ? 'marked' : 'to mark'} as simulated: ${count}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
