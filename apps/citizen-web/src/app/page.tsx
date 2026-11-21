import { ApplicationId } from '@smart-light/shared';
import { KeyValueList, PortalShell, SurfaceCard } from '@smart-light/ui';
import { citizenEnv } from '@/lib/env';

export default function CitizenHomePage() {
  return (
    <PortalShell
      portalName={citizenEnv.NEXT_PUBLIC_APP_NAME}
      badgeLabel="Phase 0 · Foundation"
      badgeTone="info"
      description="Public-facing portal for citizens to check street light service notices, submit outage reports, and follow resolution progress. Business modules will be enabled in subsequent phases."
    >
      <SurfaceCard
        title="Application Configuration"
        subtitle="Verified runtime wiring to the central backend API and shared packages."
      >
        <KeyValueList
          items={[
            { label: 'Application ID', value: ApplicationId.CitizenWeb, mono: true },
            {
              label: 'Central API Base URL',
              value: citizenEnv.NEXT_PUBLIC_API_BASE_URL,
              mono: true,
            },
            { label: 'Deployment Target', value: 'Vercel (Independent Project)' },
            { label: 'Backend Boundary', value: 'Central Express API only (no local API routes)' },
          ]}
        />
      </SurfaceCard>

      <SurfaceCard
        title="Planned Citizen Capabilities"
        subtitle="Reserved placeholders for upcoming implementation phases."
      >
        <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8, color: '#334155' }}>
          <li>Public outage reporting with pole location lookup</li>
          <li>Complaint status tracking by reference number</li>
          <li>Neighborhood street light service announcements</li>
        </ul>
      </SurfaceCard>
    </PortalShell>
  );
}
