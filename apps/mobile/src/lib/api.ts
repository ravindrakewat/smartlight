import { createApiClient, type LoginResponse, type TokenPair } from '@smart-light/shared';
import { storage } from './storage';
import { mobileEnv } from '../config/env';

const TOKENS_KEY = 'sl.tokens';
const baseUrl = mobileEnv.EXPO_PUBLIC_API_BASE_URL;

/**
 * Tokens live in the OS keychain/keystore (see storage.ts), never in plain
 * storage. A copy is kept in memory for request headers.
 */
let tokens: TokenPair | null = null;
let onSessionExpired: (() => void) | null = null;

export async function loadStoredTokens(): Promise<boolean> {
  const raw = await storage.get(TOKENS_KEY);
  tokens = raw ? (JSON.parse(raw) as TokenPair) : null;
  return tokens !== null;
}

export async function saveTokens(next: TokenPair | null): Promise<void> {
  tokens = next;
  if (next) {
    await storage.set(TOKENS_KEY, JSON.stringify(next));
  } else {
    await storage.remove(TOKENS_KEY);
  }
}

/** Called when the refresh token is rejected (signed out elsewhere, disabled, expired). */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

async function refreshTokens(): Promise<boolean> {
  if (!tokens) {
    return false;
  }
  try {
    const response = await fetch(`${baseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (!response.ok) {
      await saveTokens(null);
      onSessionExpired?.();
      return false;
    }
    const body = (await response.json()) as { data: LoginResponse };
    if (!body.data.tokens) {
      return false;
    }
    await saveTokens(body.data.tokens);
    return true;
  } catch {
    return false;
  }
}

export const api = createApiClient({
  baseUrl,
  getHeaders: (): Record<string, string> =>
    tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  onUnauthorized: refreshTokens,
});

/**
 * Uploads a local file (e.g. a photo the camera saved) as a raw request body.
 * Retries once after refreshing an expired access token.
 */
export async function uploadFile(
  path: string,
  fileUri: string,
  contentType: string,
  query: Record<string, string | number | undefined> = {},
): Promise<unknown> {
  const file = await (await fetch(fileUri)).blob();
  const search = new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, String(value)]],
    ),
  ).toString();
  const url = `${baseUrl}${path}${search ? `?${search}` : ''}`;
  const send = () =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
      },
      body: file,
    });
  let response = await send();
  if (response.status === 401 && (await refreshTokens())) {
    response = await send();
  }
  const body = (await response.json().catch(() => null)) as {
    data?: unknown;
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Upload failed (${response.status})`);
  }
  return body?.data;
}

/** Absolute URL for a path the API returned relative to its base (e.g. signed photo links). */
export function apiUrl(path: string): string {
  return `${baseUrl}${path}`;
}
