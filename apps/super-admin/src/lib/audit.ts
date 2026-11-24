/** Audit action families (the part before the first dot), used for labels and filters. */
export const AUDIT_CATEGORIES = [
  'auth',
  'tenant',
  'user',
  'agency',
  'zone',
  'pole',
  'device',
  'lighting',
  'schedule',
  'work_order',
  'complaint',
  'alert',
  'citizen',
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export function auditCategory(action: string): AuditCategory | null {
  const family = action.split('.')[0] ?? '';
  return (AUDIT_CATEGORIES as readonly string[]).includes(family)
    ? (family as AuditCategory)
    : null;
}

/** Failed sign-ins and token reuse are worth a second look. */
export function isSecurityEvent(action: string): boolean {
  return action === 'auth.login_failed' || action === 'auth.refresh_token_reuse';
}
