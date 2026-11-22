import { municipalEnv } from './env';

/** Codes from the most recent import in this tab, for "print these plates". */
export const LAST_IMPORT_STORAGE_KEY = 'sl:last-import-codes';

/** Most poles printed in one go (about 340 A4 pages at 6 plates per page). */
export const MAX_PLATES_PER_PRINT = 2000;

const portal = new URL(municipalEnv.NEXT_PUBLIC_CITIZEN_PORTAL_URL);

/** URL encoded in a pole's QR code: the citizen portal's pole page. */
export function plateUrl(code: string): string {
  return new URL(`/p/${encodeURIComponent(code)}`, portal).toString();
}

/** Short host printed under the QR for people who type the address instead. */
export const portalHost = portal.host;

/**
 * True when the console runs on a real domain but plates would point to a
 * local development address: printing those would put useless QR codes on
 * thousands of poles, so the print page refuses.
 */
export function portalMisconfigured(currentHost: string): boolean {
  const isLocal = (host: string) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return isLocal(portal.host) && !isLocal(currentHost);
}
