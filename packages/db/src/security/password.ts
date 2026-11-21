import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing: Argon2id with OWASP-recommended parameters
 * (19 MiB memory, 2 iterations, 1 lane). The algorithm and parameters are
 * encoded in the hash string, so they can be raised later without breaking
 * existing hashes.
 */
const ARGON2_OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}
