import { AppShell, FullscreenButton, type AppShellNavItem } from '@smart-light/ui';
import {
  Activity,
  Building2,
  Cpu,
  HardDriveDownload,
  LayoutDashboard,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LocaleSwitcher } from './LocaleSwitcher';
import { UserMenu } from './Session';
import { SidebarBrand } from './shell/SidebarBrand';
import { SystemStatus } from './shell/SystemStatus';

export async function ConsoleShell({ children }: { children: ReactNode }) {
  const t = await getTranslations();

  const navigation: AppShellNavItem[] = [
    { href: '/', label: t('Nav.overview'), icon: <LayoutDashboard /> },
    { href: '/municipalities', label: t('Nav.municipalities'), icon: <Building2 /> },
    { href: '/devices', label: t('Nav.devices'), icon: <Cpu /> },
    { href: '/firmware', label: t('Nav.firmware'), icon: <HardDriveDownload /> },
    { href: '/users', label: t('Nav.users'), icon: <Users /> },
    { href: '/audit', label: t('Nav.audit'), icon: <ScrollText /> },
    { href: '/health', label: t('Nav.health'), icon: <Activity /> },
    { href: '/settings', label: t('Nav.settings'), icon: <Settings /> },
  ];

  return (
    <AppShell
      productName={t('Common.productName')}
      consoleName={t('Common.consoleName')}
      navigation={navigation}
      labels={{
        navigation: t('Common.navigation'),
        openMenu: t('Common.openMenu'),
        closeMenu: t('Common.closeMenu'),
        skipToContent: t('Common.skipToContent'),
      }}
      mainClassName="pt-4 lg:pt-4"
      sidebarFooter={
        <div className="grid gap-2">
          <SidebarBrand />
          <SystemStatus />
        </div>
      }
      headerActions={
        <>
          <FullscreenButton label={t('Shell.fullscreen')} />
          <LocaleSwitcher />
          <UserMenu />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
