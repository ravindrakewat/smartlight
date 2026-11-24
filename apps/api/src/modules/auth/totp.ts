/**
 * Time-based one-time passwords (RFC 6238: HMAC-SHA1, 6 digits, 30-second steps)
 * and the at-rest protection of their secrets. Node's crypto only; no extra
 * dependency. Works with Google Authenticator, Microsoft Authenticator, Authy, etc.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '../../config/env';

const STEP_SECONDS = 30;
const DIGITS = 6;
/** Accept the previous and next step too, for phone clocks that drift a little. */
const WINDOW = 1;
const ISSUER = 'Smart Street Light';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid base32');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 160-bit secret, as RFC 4226 recommends. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function currentStep(now: number = Date.now()): number {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Returns the matched step, or null. A step at or before `lastUsedStep` is never
 * accepted again, so an observed code cannot be replayed.
 */
export function verifyTotp(
  secret: string,
  code: string,
  lastUsedStep: number | null,
  now: number = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) {
    return null;
  }
  const step = currentStep(now);
  for (let offset = -WINDOW; offset <= WINDOW; offset += 1) {
    const candidate = step + offset;
    if (lastUsedStep !== null && candidate <= lastUsedStep) {
      continue;
    }
    if (safeEqual(totpAt(secret, candidate), code)) {
      return candidate;
    }
  }
  return null;
}

export function otpauthUri(secret: string, account: string): string {
  const label = encodeURIComponent(`${ISSUER}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ─── Secrets at rest ─────────────────────────────────────────────────────────

/** 32-byte key: MFA_ENCRYPTION_KEY, or (local/test only) derived from the JWT secret. */
function encryptionKey(): Buffer {
  if (env.MFA_ENCRYPTION_KEY) {
    return Buffer.from(env.MFA_ENCRYPTION_KEY, 'base64');
  }
  return createHash('sha256').update(`mfa-key:${env.JWT_ACCESS_SECRET}`).digest();
}

/** AES-256-GCM; stored as `v1:<iv>:<tag>:<ciphertext>` (base64url parts). */
export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join(':');
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, ciphertext] = stored.split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext) {
    throw new Error('Unsupported two-factor secret format');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

// ─── Recovery codes ──────────────────────────────────────────────────────────

const RECOVERY_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
export const RECOVERY_CODE_COUNT = 10;

/** `xxxx-xxxx` from a 32-letter alphabet: 40 bits each, shown once. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(8);
    const letters = [...bytes].map((byte) => RECOVERY_ALPHABET[byte & 31]).join('');
    return `${letters.slice(0, 4)}-${letters.slice(4, 8)}`;
  });
}

/** Keyed hash (HMAC) so a database leak alone cannot be brute-forced offline. */
export function hashRecoveryCode(code: string): string {
  const normalised = code.replace(/[\s-]/g, '').toLowerCase();
  return createHmac('sha256', encryptionKey()).update(`recovery:${normalised}`).digest('hex');
}

export function isRecoveryCode(code: string): boolean {
  return /^[a-z2-7]{4}-?[a-z2-7]{4}$/.test(code);
}
