import type { UserRoleName } from '@smart-light/shared';

/** Role groups used by route guards. Keep authorisation decisions in one place. */
export const ROLE_GROUPS = {
  /** Anyone who works inside a municipality. */
  tenantStaff: [
    'MUNICIPAL_ADMIN',
    'SUPERVISOR',
    'OPERATOR',
    'AGENCY_MANAGER',
    'TECHNICIAN',
  ] satisfies UserRoleName[],
  /** Read access to municipal data, including the platform operator. */
  tenantReaders: [
    'SUPER_ADMIN',
    'MUNICIPAL_ADMIN',
    'SUPERVISOR',
    'OPERATOR',
    'AGENCY_MANAGER',
    'TECHNICIAN',
  ] satisfies UserRoleName[],
  /** Control-room and management roles. */
  tenantManagers: [
    'SUPER_ADMIN',
    'MUNICIPAL_ADMIN',
    'SUPERVISOR',
    'OPERATOR',
  ] satisfies UserRoleName[],
  /** May change assets (poles, zones). */
  assetEditors: ['SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'SUPERVISOR'] satisfies UserRoleName[],
  /** May administer people and organisations. */
  admins: ['SUPER_ADMIN', 'MUNICIPAL_ADMIN'] satisfies UserRoleName[],
} as const;

export function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
