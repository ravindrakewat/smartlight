/**
 * Emergency: clears two-factor sign-in for one account (lost phone AND lost
 * recovery codes) when no other platform administrator can do it from the
 * console (POST /api/v1/users/:id/mfa-reset). Ends all of the person's sessions;
 * a role that requires two-factor enrols again at the next sign-in.
 *
 *   npm run mfa:reset -w @smart-light/db             (uses DATABASE_URL)
 *   npm run mfa:reset:render -w @smart-light/db       (RENDER_EXTERNAL_DATABASE_URL
 *                                                      from apps/api/.env)
 *
 * The e-mail is typed in the terminal and the action is written to the audit log.
 * Only someone with database access can run this; keep it that way.
 */
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline';
import { config as loadEnv } from 'dotenv';
import { createPrismaClient } from '../src';

const useRender = process.argv.includes('--render');
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

async function main(): Promise<void> {
  // Lines are read in order, so answers piped in ahead of the prompts are not lost.
  const rl = createInterface({ input: stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (question: string): Promise<string> => {
    stdout.write(question);
    const next = await lines.next();
    if (!stdin.isTTY) stdout.write('\n');
    return next.done ? '' : String(next.value).trim();
  };
  const host = new URL(databaseUrl as string).hostname;
  console.log(`\nClear two-factor sign-in on database host: ${host}\n`);
  const email = (await ask('E-mail of the account: ')).toLowerCase();
  const reason = await ask('Reason (kept in the audit log): ');
  const confirm = await ask(`Type RESET to clear two-factor for ${email}: `);
  rl.close();
  if (confirm !== 'RESET' || !email || reason.length < 5) {
    throw new Error('Cancelled: an e-mail, a reason (5+ characters) and RESET are required.');
  }

  const prisma = createPrismaClient(withSsl(databaseUrl as string), { maxConnections: 1 });
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error(`No user with e-mail ${email}.`);
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { totpEnabled: false, totpEnabledAt: null, totpSecret: null, totpLastStep: null },
      }),
      prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
      prisma.mfaChallenge.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorType: 'SYSTEM',
          action: 'user.mfa_reset',
          entityType: 'user',
          entityId: user.id,
          metadata: { via: 'reset-mfa script', reason },
        },
      }),
    ]);
    console.log(`\nTwo-factor sign-in cleared for ${email}; all sessions ended.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
