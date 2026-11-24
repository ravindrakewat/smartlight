'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { BrandMark } from './BrandMark';
import { SkipLink } from './SkipLink';

export interface AppShellNavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Optional count or marker after the label (e.g. open alerts). */
  badge?: ReactNode;
}

export interface AppShellProps {
  /** e.g. "Smart Street Light" */
  productName: string;
  /** e.g. "Municipal Control Centre" */
  consoleName: string;
  navigation: AppShellNavItem[];
  labels: {
    navigation: string;
    openMenu: string;
    closeMenu: string;
    skipToContent: string;
  };
  /** Left side of the top bar, e.g. a search box. */
  headerStart?: ReactNode;
  /** Right side of the top bar: notifications, language switcher, user menu… */
  headerActions?: ReactNode;
  /** Bottom of the sidebar, e.g. a system status card. */
  sidebarFooter?: ReactNode;
  children: ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ items, pathname }: { items: AppShellNavItem[]; pathname: string }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-sidebar-foreground [&_svg]:size-[1.15rem] [&_svg]:shrink-0',
                active
                  ? 'bg-primary text-primary-foreground shadow-md shadow-black/30'
                  : 'text-sidebar-muted hover:bg-sidebar-soft hover:text-sidebar-foreground',
              )}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Brand({
  productName,
  consoleName,
  onDark = false,
  compact = false,
}: {
  productName: string;
  consoleName: string;
  onDark?: boolean;
  /** Logo only on very narrow screens (the name stays available to screen readers). */
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <BrandMark />
      <div className={cn('min-w-0 leading-tight', compact && 'max-[479px]:sr-only')}>
        <p className={cn('truncate text-sm font-semibold', onDark && 'text-sidebar-foreground')}>
          {productName}
        </p>
        <p
          className={cn(
            'truncate text-xs',
            onDark ? 'text-sidebar-muted' : 'text-muted-foreground',
          )}
        >
          {consoleName}
        </p>
      </div>
    </div>
  );
}

/** A city skyline at night along the foot of the sidebar. Decorative. */
function Skyline() {
  return (
    <svg
      viewBox="0 0 240 64"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMax slice"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full text-sidebar-soft"
    >
      <path
        fill="currentColor"
        d="M0 64V40h10V30h8v10h6V22h12v18h6V34h10v-8h4v8h8v30h6V18h4l2-6 2 6h4v46h8V36h12v28h6V26h10v-6h6v6h4v38h8V30h14v34h6V40h8V28h6v-6h4v6h6v36h10V34h12v30z"
      />
      <g className="fill-lamp" opacity="0.55">
        <rect x="26" y="28" width="2" height="2" />
        <rect x="31" y="34" width="2" height="2" />
        <rect x="76" y="24" width="2" height="2" />
        <rect x="76" y="32" width="2" height="2" />
        <rect x="80" y="40" width="2" height="2" />
        <rect x="126" y="30" width="2" height="2" />
        <rect x="131" y="38" width="2" height="2" />
        <rect x="160" y="36" width="2" height="2" />
        <rect x="166" y="44" width="2" height="2" />
        <rect x="200" y="30" width="2" height="2" />
        <rect x="222" y="40" width="2" height="2" />
      </g>
    </svg>
  );
}

/** Responsive console layout: navy sidebar on desktop, collapsible menu on mobile. */
export function AppShell({
  productName,
  consoleName,
  navigation,
  labels,
  headerStart,
  headerActions,
  sidebarFooter,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <SkipLink label={labels.skipToContent} />

      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-hidden bg-sidebar px-4 pt-6 lg:flex">
        <div className="px-1">
          <Brand productName={productName} consoleName={consoleName} onDark />
        </div>
        <nav
          aria-label={labels.navigation}
          className="relative z-10 -mx-1 flex-1 overflow-y-auto px-1"
        >
          <NavList items={navigation} pathname={pathname} />
        </nav>
        <div className="relative z-10 pb-5">{sidebarFooter}</div>
        <Skyline />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-8">
            <button
              type="button"
              className="grid size-11 cursor-pointer place-items-center rounded-lg text-foreground hover:bg-surface-subtle lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              aria-label={menuOpen ? labels.closeMenu : labels.openMenu}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <div className="min-w-0 sm:hidden">
              <Brand productName={productName} consoleName={consoleName} compact />
            </div>
            {headerStart ? (
              <div className="hidden min-w-0 flex-1 sm:block lg:max-w-xl">{headerStart}</div>
            ) : null}
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">{headerActions}</div>
          </div>

          {menuOpen ? (
            <nav
              id="mobile-navigation"
              aria-label={labels.navigation}
              className="border-t border-border bg-sidebar px-3 py-3 lg:hidden"
            >
              {headerStart ? <div className="mb-3 sm:hidden">{headerStart}</div> : null}
              <NavList items={navigation} pathname={pathname} />
            </nav>
          ) : null}
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-6 outline-none lg:px-8 lg:py-6"
        >
          <div className="mx-auto w-full max-w-[96rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}
