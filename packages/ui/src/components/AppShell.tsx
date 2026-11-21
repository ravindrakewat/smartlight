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
  /** Right side of the top bar: language switcher, user menu… */
  headerActions?: ReactNode;
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
                'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors [&_svg]:size-[1.15rem] [&_svg]:shrink-0',
                active
                  ? 'bg-primary-subtle text-primary'
                  : 'text-muted-foreground hover:bg-surface-subtle hover:text-foreground',
              )}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Brand({ productName, consoleName }: { productName: string; consoleName: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <BrandMark />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold">{productName}</p>
        <p className="truncate text-xs text-muted-foreground">{consoleName}</p>
      </div>
    </div>
  );
}

/** Responsive console layout: fixed sidebar on desktop, collapsible menu on mobile. */
export function AppShell({
  productName,
  consoleName,
  navigation,
  labels,
  headerActions,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <SkipLink label={labels.skipToContent} />

      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border bg-surface px-4 py-5 lg:flex">
        <Brand productName={productName} consoleName={consoleName} />
        <nav aria-label={labels.navigation} className="flex-1 overflow-y-auto">
          <NavList items={navigation} pathname={pathname} />
        </nav>
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
            <div className="min-w-0 lg:hidden">
              <Brand productName={productName} consoleName={consoleName} />
            </div>
            <div className="ml-auto flex items-center gap-2">{headerActions}</div>
          </div>

          {menuOpen ? (
            <nav
              id="mobile-navigation"
              aria-label={labels.navigation}
              className="border-t border-border px-3 py-3 lg:hidden"
            >
              <NavList items={navigation} pathname={pathname} />
            </nav>
          ) : null}
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-6 outline-none lg:px-8 lg:py-8"
        >
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
