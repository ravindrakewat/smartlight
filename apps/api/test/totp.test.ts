import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  totpAt,
  verifyTotp,
} from '../src/modules/auth/totp';

// RFC 6238 appendix B (SHA-1 seed "12345678901234567890"), last 6 of the 8 digits.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const RFC_VECTORS: [number, string][] = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
];

describe('TOTP (RFC 6238)', () => {
  it('matches the RFC test vectors', () => {
    for (const [seconds, code] of RFC_VECTORS) {
      expect(totpAt(RFC_SECRET, Math.floor(seconds / 30))).toBe(code);
    }
  });

  it('round-trips base32', () => {
    expect(base32Decode(RFC_SECRET).toString()).toBe('12345678901234567890');
  });

  it('accepts one step of clock drift each way, never an older or reused step', () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 1000 / 30);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 1), null, now)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 2), null, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step), step, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, '12345', null, now)).toBeNull();
  });

  it('encrypts secrets with a fresh IV and detects tampering', () => {
    const first = encryptSecret(RFC_SECRET);
    const second = encryptSecret(RFC_SECRET);
    expect(first).not.toBe(second);
    expect(decryptSecret(first)).toBe(RFC_SECRET);
    const parts = first.split(':');
    parts[3] = `${parts[3]?.startsWith('A') ? 'B' : 'A'}${parts[3]?.slice(1)}`;
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('makes 10 distinct recovery codes and hashes them ignoring case and dashes', () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
    }
    const sample = codes[0] ?? '';
    expect(hashRecoveryCode(sample.toUpperCase().replace('-', ''))).toBe(hashRecoveryCode(sample));
  });
});
