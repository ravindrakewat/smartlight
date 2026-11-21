/**
 * PREVIEW DATA — for UI review only, shown with a visible "Preview data" badge.
 * Replace with live data from @smart-light/api once the assets and telemetry
 * modules are implemented. Do not add business logic here.
 */

export const previewSummary = {
  totalLights: 12480,
  working: 11962,
  faulty: 318,
  offline: 200,
  energyTodayKwh: 18640.5,
  dimmingSavingsRatio: 0.27,
};

export type PreviewAlertType =
  'lamp_failure' | 'relay_stuck' | 'day_burning' | 'under_voltage' | 'offline';

export interface PreviewAlert {
  id: string;
  poleCode: string;
  zone: string;
  type: PreviewAlertType;
  severity: 'critical' | 'warning';
  minutesAgo: number;
}

export const previewAlerts: PreviewAlert[] = [
  {
    id: 'a1',
    poleCode: 'SL-004182',
    zone: 'Zone 3',
    type: 'lamp_failure',
    severity: 'critical',
    minutesAgo: 8,
  },
  {
    id: 'a2',
    poleCode: 'SL-001907',
    zone: 'Zone 1',
    type: 'relay_stuck',
    severity: 'critical',
    minutesAgo: 34,
  },
  {
    id: 'a3',
    poleCode: 'SL-007731',
    zone: 'Zone 5',
    type: 'offline',
    severity: 'warning',
    minutesAgo: 72,
  },
  {
    id: 'a4',
    poleCode: 'SL-002265',
    zone: 'Zone 2',
    type: 'under_voltage',
    severity: 'warning',
    minutesAgo: 140,
  },
];

export interface PreviewZone {
  name: string;
  total: number;
  working: number;
  faulty: number;
}

export const previewZones: PreviewZone[] = [
  { name: 'Zone 1', total: 2860, working: 2771, faulty: 52 },
  { name: 'Zone 2', total: 2415, working: 2330, faulty: 61 },
  { name: 'Zone 3', total: 2702, working: 2569, faulty: 88 },
  { name: 'Zone 4', total: 2188, working: 2122, faulty: 39 },
  { name: 'Zone 5', total: 2315, working: 2170, faulty: 78 },
];
