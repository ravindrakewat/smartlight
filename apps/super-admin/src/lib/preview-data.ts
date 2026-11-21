/**
 * PREVIEW DATA — for UI review only, shown with a visible "Preview data" badge.
 * Replace with live data from @smart-light/api once tenant management is implemented.
 */

export type PreviewTenantStatus = 'active' | 'onboarding' | 'suspended';

export interface PreviewTenant {
  id: string;
  name: string;
  devices: number;
  online: number;
  status: PreviewTenantStatus;
}

export const previewTenants: PreviewTenant[] = [
  {
    id: 'indore-mc',
    name: 'Indore Municipal Corporation',
    devices: 12480,
    online: 12280,
    status: 'active',
  },
  {
    id: 'delhi-mc',
    name: 'Municipal Corporation of Delhi',
    devices: 0,
    online: 0,
    status: 'onboarding',
  },
];

export const previewOpenCriticalAlerts = 318;
