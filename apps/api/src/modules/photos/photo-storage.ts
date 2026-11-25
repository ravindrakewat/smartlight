/**
 * Private storage for repair photos behind a small interface, so the provider
 * (India-region object storage, pending decision) can be added without touching
 * the routes. Only a local-disk driver exists today, for development and tests.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { env } from '../../config/env';
import { AppError } from '../../utils/app-error';

export interface PhotoStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

function localStorage(root: string): PhotoStorage {
  const base = resolve(root);
  const pathOf = (key: string) => {
    const full = resolve(base, key);
    if (!full.startsWith(base + sep)) {
      throw new Error('Invalid storage key');
    }
    return full;
  };
  return {
    async put(key, bytes) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes, { flag: 'wx' });
    },
    async get(key) {
      return readFile(pathOf(key));
    },
  };
}

let storage: PhotoStorage | null | undefined;

/** The configured store, or a 503 when photo uploads are switched off. */
export function photoStorage(): PhotoStorage {
  if (storage === undefined) {
    const driver = env.PHOTO_STORAGE ?? (env.NODE_ENV === 'production' ? 'none' : 'local');
    storage = driver === 'local' ? localStorage(env.PHOTO_LOCAL_DIR) : null;
  }
  if (!storage) {
    throw new AppError({
      statusCode: 503,
      code: 'PHOTO_STORAGE_NOT_CONFIGURED',
      message: 'Photo storage is not configured on this server',
    });
  }
  return storage;
}

/** Accepted image types, recognised by their first bytes (the declared type is not trusted). */
export function detectImageType(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length > 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    bytes.length > 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

// ── Signed, short-lived links so <img> tags work without exposing tokens ──

const URL_TTL_SECONDS = 10 * 60;
const signingKey = createHash('sha256').update(`photo-url:${env.JWT_ACCESS_SECRET}`).digest();

function signature(photoId: string, expires: number): string {
  return createHmac('sha256', signingKey).update(`${photoId}.${expires}`).digest('base64url');
}

/** Path (relative to the API base, e.g. `/v1/photos/…`) valid for ten minutes. */
export function signedPhotoPath(photoId: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + URL_TTL_SECONDS;
  return `/v1/photos/${photoId}?exp=${expires}&sig=${signature(photoId, expires)}`;
}

export function verifyPhotoSignature(
  photoId: string,
  expires: number,
  sig: string,
  now = Date.now(),
): boolean {
  if (!Number.isInteger(expires) || expires < Math.floor(now / 1000)) return false;
  const expected = Buffer.from(signature(photoId, expires));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
