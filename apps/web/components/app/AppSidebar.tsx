'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Logo } from '@urganize/ui';
import {
  BarChart3,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  LayoutDashboard,
  Settings,
  Users2,
  X,
} from 'lucide-react';

type AppSidebarProps = {
  userName?: string;
  collapsed?: boolean;
  mobileOpen?: boolean;
  onToggleCollapsed?: () => void;
  onCloseMobile?: () => void;
};

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
  match: (pathname: string | null) => boolean;
};

const navItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    description: 'Command center',
    icon: LayoutDashboard,
    match: (pathname) => pathname === '/dashboard',
  },
  {
    href: '/dashboard/releases',
    label: 'Releases',
    description: 'Launch pipeline',
    icon: BarChart3,
    match: (pathname) =>
      pathname?.startsWith('/dashboard/releases') === true ||
      pathname?.startsWith('/dashboard/plans') === true,
  },
  {
    href: '/dashboard/tasks',
    label: 'Tasks',
    description: 'Execution queue',
    icon: CheckSquare2,
    match: (pathname) => pathname?.startsWith('/dashboard/tasks') === true,
  },
  {
    href: '/dashboard/folders',
    label: 'Assets',
    description: 'Files and notes',
    icon: FolderKanban,
    match: (pathname) =>
      pathname?.startsWith('/dashboard/folders') === true ||
      pathname?.startsWith('/dashboard/songs') === true,
  },
  {
    href: '/dashboard/settings/team',
    label: 'Team',
    description: 'Members and roles',
    icon: Users2,
    match: (pathname) => pathname?.startsWith('/dashboard/settings/team') === true,
  },
  {
    href: '/settings',
    label: 'Settings',
    description: 'Workspace config',
    icon: Settings,
    match: (pathname) => pathname === '/settings' || pathname?.startsWith('/settings/') === true,
  },
];

function SidebarNav({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 px-2 py-3" aria-label="Workspace">
      <div className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.match(pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex min-h-[44px] items-center gap-3 border px-3 text-sm transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'border-stroke-default bg-bg-sidebar-active text-content-primary'
                  : 'border-transparent text-content-secondary hover:border-stroke-subtle hover:bg-white/[0.03] hover:text-content-primary'
              }`}
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center ${
                  isActive ? 'text-brand' : 'text-content-tertiary group-hover:text-content-primary'
                }`}
                aria-hidden="true"
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </span>
              {!collapsed ? (
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.label}</span>
                  <span className="block truncate text-[11px] leading-4 text-content-tertiary">
                    {item.description}
                  </span>
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function SidebarFrame({
  userName,
  collapsed = false,
  onToggleCollapsed,
  onCloseMobile,
  mobile = false,
}: {
  userName?: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onCloseMobile?: () => void;
  mobile?: boolean;
}) {
  return (
    <div className="flex h-full flex-col border-r border-stroke-subtle bg-bg-sidebar/95 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between border-b border-stroke-subtle px-3">
        <Link href="/dashboard" className={`min-w-0 ${collapsed ? 'mx-auto' : ''}`} onClick={mobile ? onCloseMobile : undefined}>
          {collapsed ? (
            <div className="grid h-9 w-9 place-items-center border border-stroke-default bg-bg-elevated">
              <span className="font-display text-sm font-semibold text-brand">U</span>
            </div>
          ) : (
            <Logo size="md" priority className="justify-start opacity-90" />
          )}
        </Link>

        {mobile ? (
          <button
            type="button"
            onClick={onCloseMobile}
            className="grid h-9 w-9 place-items-center border border-stroke-default text-content-secondary hover:bg-white/[0.04] hover:text-content-primary md:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <SidebarNav collapsed={collapsed} />

      <div className="mt-auto border-t border-stroke-subtle p-3">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="grid h-9 w-9 shrink-0 place-items-center border border-stroke-default bg-bg-elevated text-xs font-semibold text-content-primary">
            {(userName || 'U').trim().slice(0, 1).toUpperCase()}
          </div>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-content-primary">{userName || 'Urganize'}</p>
              <p className="truncate text-[11px] text-content-tertiary">Workspace</p>
            </div>
          ) : null}
        </div>

        {!mobile ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="mt-3 hidden h-9 w-full items-center justify-center gap-2 border border-stroke-default text-xs font-medium text-content-secondary hover:bg-white/[0.04] hover:text-content-primary md:flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {!collapsed ? <span>Collapse</span> : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function AppSidebar({
  userName,
  collapsed = false,
  mobileOpen = false,
  onToggleCollapsed,
  onCloseMobile,
}: AppSidebarProps) {
  const pathname = usePathname();

  useEffect(() => {
    onCloseMobile?.();
  }, [onCloseMobile, pathname]);

  return (
    <>
      <aside
        className={`sticky top-0 z-40 hidden h-screen shrink-0 transition-[width] duration-200 md:block ${
          collapsed ? 'w-[76px]' : 'w-[264px]'
        }`}
      >
        <SidebarFrame userName={userName} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[180] md:hidden">
          <button
            type="button"
            onClick={onCloseMobile}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Close sidebar"
          />
          <aside className="absolute left-0 top-0 h-full w-[min(88vw,320px)]">
            <SidebarFrame userName={userName} mobile onCloseMobile={onCloseMobile} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
