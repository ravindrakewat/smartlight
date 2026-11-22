import type { WorkOrderStatusName } from '@smart-light/shared';
import type { Messages } from '../i18n/messages';
import type { ToneName } from '../theme';

export const STATUS_TONES: Record<WorkOrderStatusName, ToneName> = {
  OPEN: 'danger',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  PENDING_VERIFICATION: 'warning',
  RESOLVED: 'success',
  CANCELLED: 'neutral',
};

export const PRIORITY_TONES: Record<'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW', ToneName> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  NORMAL: 'neutral',
  LOW: 'neutral',
};

export function faultLabel(m: Messages, fault: string | null): string {
  const faults = m.fault as Record<string, string>;
  return (fault && faults[fault]) ?? m.fault.unknown;
}
