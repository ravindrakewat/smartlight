import { ApplicationId } from '@smart-light/shared';
import { KeyValueList, PortalShell, SurfaceCard } from '@smart-light/ui';
import { superAdminEnv } from '@/lib/env';

export default function SuperAdminHomePage() {
  return (
    <PortalShell
      portalName={superAdminEnv.NEXT_PUBLIC_APP_NAME}
      badgeLabel="Phase 0 · Platform Governance"
      badgeTone="warning"
      description="Platform-level administration console for provisioning municipal tenants, managing SaaS plans, and overseeing system-wide health. Privileged RBAC and tenant management modules will be implemented in later phases."
    >
      <SurfaceCard
        title="Application Configuration"
        subtitle="Verified runtime wiring to the central backend API and shared web UI library."
      >
        <KeyValueList
          items={[
            { label: 'Application ID', value: ApplicationId.SuperAdmin, mono: true },
            {
              label: 'Central API Base URL',
              value: superAdminEnv.NEXT_PUBLIC_API_BASE_URL,
              mono: true,
            },
            { label: 'Deployment Target', value: 'Vercel (Independent Project)' },
            { label: 'Control Plane', value: 'Central Express API (RBAC in future phase)' },
          ]}
        />
      </SurfaceCard>

      <SurfaceCard
        title="Planned Platform Modules"
        subtitle="Reserved placeholders for upcoming implementation phases."
      >
        <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8, color: '#334155' }}>
          <li>Municipality tenant onboarding and lifecycle governance</li>
          <li>Global IoT broker health and background job oversight</li>
          <li>Platform audit trails and subscription quota management</li>
        </ul>
      </SurfaceCard>
    </PortalShell>
  );
}
