/**
 * Encryption for device secrets at rest (LoRaWAN AppKeys). AES-256-GCM with
 * DEVICE_SECRET_KEY; stored as `v1:<iv>:<tag>:<ciphertext>`. A keyed fingerprint
 * lets the database enforce "no two devices share a key" without storing it.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { NodeEnvironment } from '@smart-light/shared';
import { env } from '../config/env';

export class DeviceSecretKeyMissingError extends Error {}

function key(): Buffer {
  if (env.DEVICE_SECRET_KEY) {
    return Buffer.from(env.DEVICE_SECRET_KEY, 'base64');
  }
  if (env.NODE_ENV === NodeEnvironment.Production) {
    // Production never derives keys; provisioning is refused until the key is set.
    throw new DeviceSecretKeyMissingError('DEVICE_SECRET_KEY is not configured');
  }
  return createHash('sha256').update(`device-secrets:${env.JWT_ACCESS_SECRET}`).digest();
}

export function sealDeviceSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function openDeviceSecret(sealed: string): string {
  const [version, iv, tag, ciphertext] = sealed.split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext) {
    throw new Error('Unsupported device secret format');
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function deviceSecretFingerprint(plain: string): string {
  return createHmac('sha256', key()).update(`fingerprint:${plain.toLowerCase()}`).digest('hex');
}
