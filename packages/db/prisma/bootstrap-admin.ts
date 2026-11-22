/**
 * Creates the first platform administrator (SUPER_ADMIN) on an empty database.
 * Production has no seed data, so this is how the first person signs in.
 *
 *   npm run bootstrap:admin -w @smart-light/db             (uses DATABASE_URL)
 *   npm run bootstrap:admin -w @smart-light/db -- --render (uses RENDER_EXTERNAL_DATABASE_URL
 *                                                           from apps/api/.env)
 *
 * The password is typed in the terminal (hidden) and never passed as an argument,
 * so it does not end up in shell history or chat logs. Further administrators are
 * created from the super-admin console, which enforces the same rules.
 */
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline';
import { config as loadEnv } from 'dotenv';
import { newPasswordSchema } from '@smart-light/shared';
import { createPrismaClient } from '../src';
import { hashPassword } from '../src/security/password';

const useRender = process.argv.includes('--render');
if (useRender) {
  loadEnv({ path: '../../apps/api/.env', quiet: true });
} else {
  loadEnv({ quiet: true });
}

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
  return `${url}${url.includes('?') ? '&' : '?'}sslmode=require`;
}

const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });
type MutableInterface = { _writeToOutput: (text: string) => void };
const writeToOutput = (rl as unknown as MutableInterface)._writeToOutput.bind(rl);
let muted = false;
// While a password is typed, swallow the echo of each character.
(rl as unknown as MutableInterface)._writeToOutput = (text) => {
  if (!muted) {
    writeToOutput(text);
  }
};

// Lines are queued so answers piped in ahead of the prompts are not lost.
const pendingLines: string[] = [];
let waiting: ((line: string) => void) | null = null;
let inputClosed = false;
rl.on('line', (line) => {
  if (waiting) {
    const resolve = waiting;
    waiting = null;
    resolve(line);
  } else {
    pendingLines.push(line);
  }
});
rl.on('close', () => {
  inputClosed = true;
  waiting?.('');
});

function ask(question: string, hidden = false): Promise<string> {
  stdout.write(question);
  muted = hidden;
  return new Promise<string>((resolve) => {
    const queued = pendingLines.shift();
    if (queued !== undefined || inputClosed) {
      resolve(queued ?? '');
    } else {
      waiting = resolve;
    }
  }).then((answer) => {
    if (hidden) {
      muted = false;
      stdout.write('\n');
    }
    return answer.trim();
  });
}

async function main(): Promise<void> {
  const host = new URL(databaseUrl as string).hostname;
  console.log(`\nCreate a platform administrator on database host: ${host}\n`);

  const name = await ask('Full name: ');
  const email = (await ask('E-mail: ')).toLowerCase();
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A name and a valid e-mail are required.');
  }

  const password = await ask('Password (min 12, upper + lower + digit + symbol): ', true);
  const policy = newPasswordSchema.safeParse(password);
  if (!policy.success || password.length < 12 || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error(
      'Password too weak: use at least 12 characters with upper case, lower case, a digit and a symbol.',
    );
  }
  if ((await ask('Repeat password: ', true)) !== password) {
    throw new Error('Passwords do not match.');
  }

  const prisma = createPrismaClient(withSsl(databaseUrl as string), { maxConnections: 1 });
  try {
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new Error(`A user with e-mail ${email} already exists.`);
    }
    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { role: 'SUPER_ADMIN', name, email, passwordHash },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          action: 'user.bootstrap_super_admin',
          entityType: 'user',
          entityId: created.id,
          metadata: { via: 'bootstrap-admin script' },
        },
      });
      return created;
    });
    console.log(`\nCreated SUPER_ADMIN ${user.email} (${user.id}).`);
    console.log('Turn on two-factor sign-in for this account as soon as it is available.\n');
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error: unknown) => {
    console.error(`
${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
