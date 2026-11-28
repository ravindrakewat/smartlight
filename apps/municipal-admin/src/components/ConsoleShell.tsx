import { AppShell, type AppShellNavItem } from '@smart-light/ui';
import {
  Boxes,
  Bell,
  CalendarClock,
  ClipboardList,
  FileBarChart,
  LampWallDown,
  LayoutDashboard,
  Lightbulb,
  Map as MapIcon,
  Settings,
  UsersRound,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LocaleSwitcher } from './LocaleSwitcher';
import { NotificationsMenu } from './shell/NotificationsMenu';
import { SidebarBrand } from './shell/SidebarBrand';
import { UserMenu } from './Session';
import {
  AlertsBell,
  AlertsNavBadge,
  FullscreenButton,
  HeaderSearch,
  SystemStatus,
} from './shell/ShellWidgets';

export async function ConsoleShell({ children }: { children: ReactNode }) {
  const t = await getTranslations();

  const navigation: AppShellNavItem[] = [
    { href: '/', label: t('Nav.dashboard'), icon: <LayoutDashboard /> },
    { href: '/map', label: t('Nav.map'), icon: <MapIcon /> },
    { href: '/streets', label: t('Nav.streets'), icon: <LampWallDown /> },
    { href: '/poles', label: t('Nav.assets'), icon: <Lightbulb /> },
    { href: '/alerts', label: t('Nav.alerts'), icon: <Bell />, badge: <AlertsNavBadge /> },
    { href: '/work-orders', label: t('Nav.workOrders'), icon: <ClipboardList /> },
    { href: '/schedules', label: t('Nav.schedules'), icon: <CalendarClock /> },
    { href: '/inventory', label: t('Nav.inventory'), icon: <Boxes /> },
    { href: '/reports', label: t('Nav.reports'), icon: <FileBarChart /> },
    { href: '/staff', label: t('Nav.staff'), icon: <UsersRound /> },
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
      headerStart={<HeaderSearch />}
      headerActions={
        <>
          <NotificationsMenu />
          <AlertsBell />
          <FullscreenButton />
          <LocaleSwitcher />
          <UserMenu />
        </>
      }
      mainClassName="pt-4 lg:pt-4"
      sidebarFooter={
        <div className="grid gap-2">
          <SidebarBrand />
          <SystemStatus />
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
