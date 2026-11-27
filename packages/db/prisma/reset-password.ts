/**
 * Emergency: sets a new temporary password for one account (forgotten password,
 * or locked out after too many attempts) when no administrator can do it from a
 * console. Also clears the lockout and ends the person's sessions. The new
 * password is generated here, shown once in this terminal and never stored in
 * plain text; the person should change it after signing in.
 *
 *   npm run password:reset -w @smart-light/db              (uses DATABASE_URL)
 *   npm run password:reset:render -w @smart-light/db       (RENDER_EXTERNAL_DATABASE_URL
 *                                                            from apps/api/.env)
 *   add `-- --list` to only list the accounts (e-mail, role, status, locked).
 *
 * The e-mail is typed in the terminal and the action is written to the audit log.
 * Only someone with database access can run this; keep it that way.
 */
import { randomInt } from 'node:crypto';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline';
import { config as loadEnv } from 'dotenv';
import { createPrismaClient } from '../src';
import { hashPassword } from '../src/security/password';

const useRender = process.argv.includes('--render');
const listOnly = process.argv.includes('--list');
loadEnv({ path: useRender ? '../../apps/api/.env' : '.env', quiet: true });

const databaseUrl = useRender
  ? process.env['RENDER_EXTERNAL_DATABASE_URL']
  : process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error(
    useRender
      ? 'RENDER_EXTERNAL_DATABASE_URL is not set in apps/api/.env.'
      : 'DATABASE_URL is not set (copy packages/db/.env.example to .env).',
  );
  process.exit(1);
}

/** Render's external URL needs TLS; add it when the URL does not say so. */
function withSsl(url: string): string {
  if (!useRender || /[?&]sslmode=/.test(url)) {
    return url;
  }
  return `${url}${url.includes('?') ? '&' : '?'}sslmode=verify-full`;
}

/** 16 characters with upper and lower case, digits and a symbol; no look-alikes. */
function temporaryPassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#%+=!'];
  const all = sets.join('');
  const chars = sets.map((set) => set[randomInt(set.length)]!);
  while (chars.length < 16) chars.push(all[randomInt(all.length)]!);
  for (let index = chars.length - 1; index > 0; index--) {
    const swap = randomInt(index + 1);
    [chars[index], chars[swap]] = [chars[swap]!, chars[index]!];
  }
  return chars.join('');
}

async function main(): Promise<void> {
  const host = new URL(databaseUrl as string).hostname;
  const prisma = createPrismaClient(withSsl(databaseUrl as string), { maxConnections: 1 });
  try {
    if (listOnly) {
      const users = await prisma.user.findMany({
        select: { email: true, role: true, status: true, lockedUntil: true },
        orderBy: [{ role: 'asc' }, { email: 'asc' }],
      });
      console.log(`\nAccounts on database host: ${host}\n`);
      const now = new Date();
      console.table(
        users.map((user) => ({
          email: user.email,
          role: user.role,
          status: user.status,
          locked: user.lockedUntil && user.lockedUntil > now ? 'yes' : '',
        })),
      );
      return;
    }

    // Lines are read in order, so answers piped in ahead of the prompts are not lost.
    const rl = createInterface({ input: stdin, terminal: false });
    const lines = rl[Symbol.asyncIterator]();
    const ask = async (question: string): Promise<string> => {
      stdout.write(question);
      const next = await lines.next();
      if (!stdin.isTTY) stdout.write('\n');
      return next.done ? '' : String(next.value).trim();
    };
    console.log(`\nSet a new password on database host: ${host}\n`);
    const email = (await ask('E-mail of the account: ')).toLowerCase();
    const reason = await ask('Reason (kept in the audit log): ');
    const confirm = await ask(`Type RESET to set a new password for ${email}: `);
    rl.close();
    if (confirm !== 'RESET' || !email || reason.length < 5) {
      throw new Error('Cancelled: an e-mail, a reason (5+ characters) and RESET are required.');
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error(`No user with e-mail ${email}. Run with --list to see the accounts.`);
    }
    const password = temporaryPassword();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(password),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorType: 'SYSTEM',
          action: 'user.password_reset',
          entityType: 'user',
          entityId: user.id,
          metadata: { via: 'reset-password script', reason },
        },
      }),
    ]);
    console.log(`\nNew password for ${email} (shown once, change it after signing in):`);
    console.log(`\n    ${password}\n`);
    if (user.status !== 'ACTIVE') {
      console.log(`Note: this account's status is ${user.status}; it cannot sign in until active.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
