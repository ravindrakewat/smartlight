import { ApplicationId } from '@smart-light/shared';
import { KeyValueList, PortalShell, SurfaceCard } from '@smart-light/ui';
import { municipalEnv } from '@/lib/env';

export default function MunicipalAdminHomePage() {
  return (
    <PortalShell
      portalName={municipalEnv.NEXT_PUBLIC_APP_NAME}
      badgeLabel="Phase 0 · Tenant Admin"
      badgeTone="success"
      description="Operations console for municipality administrators to manage street light assets, dimming schedules, telemetry alerts, and field work orders. Authentication and tenant dashboards will be introduced in future phases."
    >
      <SurfaceCard
        title="Application Configuration"
        subtitle="Verified runtime wiring to the central backend API and shared web UI library."
      >
        <KeyValueList
          items={[
            { label: 'Application ID', value: ApplicationId.MunicipalAdmin, mono: true },
            {
              label: 'Central API Base URL',
              value: municipalEnv.NEXT_PUBLIC_API_BASE_URL,
              mono: true,
            },
            { label: 'Deployment Target', value: 'Vercel (Independent Project)' },
            { label: 'Isolation Model', value: 'Tenant-scoped via Central Express API' },
          ]}
        />
      </SurfaceCard>

      <SurfaceCard
        title="Planned Operations Modules"
        subtitle="Reserved placeholders for upcoming implementation phases."
      >
        <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8, color: '#334155' }}>
          <li>Zone and street light inventory management</li>
          <li>Live fault monitoring and dimming schedule control</li>
          <li>Citizen complaint triage and field technician dispatch</li>
        </ul>
      </SurfaceCard>
    </PortalShell>
  );
}
