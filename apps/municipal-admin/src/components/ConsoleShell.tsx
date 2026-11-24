import { AppShell, type AppShellNavItem } from '@smart-light/ui';
import {
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
import { UserMenu } from './Session';

export async function ConsoleShell({ children }: { children: ReactNode }) {
  const t = await getTranslations();

  const navigation: AppShellNavItem[] = [
    { href: '/', label: t('Nav.dashboard'), icon: <LayoutDashboard /> },
    { href: '/map', label: t('Nav.map'), icon: <MapIcon /> },
    { href: '/streets', label: t('Nav.streets'), icon: <LampWallDown /> },
    { href: '/poles', label: t('Nav.assets'), icon: <Lightbulb /> },
    { href: '/alerts', label: t('Nav.alerts'), icon: <Bell /> },
    { href: '/work-orders', label: t('Nav.workOrders'), icon: <ClipboardList /> },
    { href: '/schedules', label: t('Nav.schedules'), icon: <CalendarClock /> },
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
      headerActions={
        <>
          <LocaleSwitcher />
          <UserMenu />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
