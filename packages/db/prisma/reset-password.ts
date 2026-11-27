/**
 * Emergency: sets a new password for one account (forgotten password, or locked
 * out after too many attempts) when no administrator can do it from a console.
 * Also clears the lockout and ends the person's sessions. Type the new password
 * (hidden, same rules as the console) or press Enter to have one generated, which
 * is shown once in this terminal. Passwords are never stored in plain text.
 *
 *   npm run password:reset -w @smart-light/db              (uses DATABASE_URL)
 *   npm run password:reset:render -w @smart-light/db       (RENDER_EXTERNAL_DATABASE_URL
 *                                                            from apps/api/.env)
 *   add `-- --list` to only list the accounts (e-mail, role, status, locked).
 *
 * Questions: e-mail, new password (twice), optional reason, then `y` to confirm.
 * The action is written to the audit log.
 * Only someone with database access can run this; keep it that way.
 */
import { randomInt } from 'node:crypto';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline';
import { newPasswordSchema } from '@smart-light/shared';
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

/**
 * Terminal questions. In a terminal, hidden answers echo `*`; when answers are piped
 * in, lines are read in order so none are lost.
 */
function prompter() {
  if (!stdin.isTTY) {
    const rl = createInterface({ input: stdin, terminal: false });
    const lines = rl[Symbol.asyncIterator]();
    return {
      ask: async (question: string, _options?: { hidden?: boolean }) => {
        stdout.write(`${question}\n`);
        const next = await lines.next();
        const answer = next.done ? '' : String(next.value);
        return _options?.hidden ? answer : answer.trim();
      },
      close: () => rl.close(),
    };
  }
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  let muted = false;
  // Echo `*` instead of the typed characters while a hidden answer is being typed.
  const internal = rl as unknown as { _writeToOutput: (text: string) => void };
  const write = internal._writeToOutput.bind(rl);
  internal._writeToOutput = (text: string) => {
    if (!muted || text.includes('\n') || text.includes('\r')) write(text);
    else write('*'.repeat(text.length));
  };
  return {
    ask: (question: string, options?: { hidden?: boolean }) =>
      new Promise<string>((resolve) => {
        stdout.write(question);
        muted = options?.hidden ?? false;
        rl.question('', (answer) => {
          const hidden = muted;
          muted = false;
          resolve(hidden ? answer : answer.trim());
        });
      }),
    close: () => rl.close(),
  };
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

    const { ask, close } = prompter();
    console.log(`\nSet a new password on database host: ${host}\n`);
    const email = (await ask('E-mail of the account: ')).toLowerCase();
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (!user) {
      close();
      throw new Error(`No user with e-mail "${email}". Run with -- --list to see the accounts.`);
    }

    const chosen = await ask(
      'New password (min 10, with a-z, A-Z and 0-9; press Enter to generate one): ',
      { hidden: true },
    );
    if (chosen) {
      const rule = newPasswordSchema.safeParse(chosen);
      if (!rule.success) {
        close();
        throw new Error(`Password not accepted: ${rule.error.issues[0]?.message ?? 'invalid'}.`);
      }
      if ((await ask('Type the new password again: ', { hidden: true })) !== chosen) {
        close();
        throw new Error('The two passwords do not match. Nothing was changed.');
      }
    }
    const reason = (await ask('Reason for the audit log (optional): ')) || 'not given';
    const confirm = await ask(`Set the new password for ${email} now? Type y and press Enter: `);
    close();
    if (confirm.toLowerCase() !== 'y') {
      throw new Error('Cancelled. Nothing was changed.');
    }
    const password = chosen || temporaryPassword();
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
    if (chosen) {
      console.log(`\nPassword changed for ${email}. Sign in with the password you typed.\n`);
    } else {
      console.log(`\nNew password for ${email} (shown once, change it after signing in):`);
      console.log(`\n    ${password}\n`);
    }
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
