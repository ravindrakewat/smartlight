import type { AuthUser, StaffUserDto, UserRoleName } from '@smart-light/shared';

/**
 * Mirrors the API's "who may manage whom" rule so the console only offers
 * actions that will succeed. The API still enforces every rule.
 */
export type ManageableRole = Exclude<UserRoleName, 'SUPER_ADMIN'>;

const ADMIN_CREATABLE: ManageableRole[] = [
  'MUNICIPAL_ADMIN',
  'SUPERVISOR',
  'OPERATOR',
  'AGENCY_MANAGER',
  'TECHNICIAN',
];

export const AGENCY_ROLES = new Set<UserRoleName>(['AGENCY_MANAGER', 'TECHNICIAN']);

export function isAdmin(user: AuthUser): boolean {
  return user.role === 'MUNICIPAL_ADMIN' || user.role === 'SUPER_ADMIN';
}

/** Roles this user may create; empty when they may not create anyone. */
export function creatableRoles(user: AuthUser): ManageableRole[] {
  if (isAdmin(user)) {
    return ADMIN_CREATABLE;
  }
  return user.role === 'AGENCY_MANAGER' ? ['TECHNICIAN'] : [];
}

export function canManage(user: AuthUser, staff: StaffUserDto): boolean {
  if (staff.id === user.id || staff.role === 'SUPER_ADMIN') {
    return false;
  }
  if (isAdmin(user)) {
    return true;
  }
  return (
    user.role === 'AGENCY_MANAGER' &&
    staff.role === 'TECHNICIAN' &&
    staff.agency?.id === user.agency?.id
  );
}
