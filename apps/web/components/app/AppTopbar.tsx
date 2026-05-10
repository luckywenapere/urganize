'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import { IconButton } from '@urganize/ui';

type AppTopbarProps = {
  userName?: string;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onOpenMobileSidebar?: () => void;
};

const routeTitles = [
  { match: (pathname: string) => pathname === '/dashboard', title: 'Dashboard', eyebrow: 'Command center' },
  { match: (pathname: string) => pathname.startsWith('/dashboard/releases'), title: 'Releases', eyebrow: 'Launch pipeline' },
  { match: (pathname: string) => pathname.startsWith('/dashboard/tasks'), title: 'Tasks', eyebrow: 'Execution queue' },
  { match: (pathname: string) => pathname.startsWith('/dashboard/folders'), title: 'Assets', eyebrow: 'Files, notes, references' },
  { match: (pathname: string) => pathname.startsWith('/dashboard/songs'), title: 'Assets', eyebrow: 'Song library' },
  { match: (pathname: string) => pathname.startsWith('/dashboard/settings/team'), title: 'Team', eyebrow: 'Workspace members' },
  { match: (pathname: string) => pathname.startsWith('/settings'), title: 'Settings', eyebrow: 'Workspace config' },
];

function getRouteTitle(pathname: string | null) {
  const safePathname = pathname || '/dashboard';
  return routeTitles.find((item) => item.match(safePathname)) || routeTitles[0];
}

export function AppTopbar({
  userName,
  isSidebarCollapsed = false,
  onToggleSidebar,
  onOpenMobileSidebar,
}: AppTopbarProps) {
  const pathname = usePathname();
  const routeTitle = getRouteTitle(pathname);
  const userInitial = (userName || 'U').trim().slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-stroke-subtle bg-bg-base/88 backdrop-blur-xl">
      <div className="flex min-h-16 items-center gap-3 px-4 sm:px-5 md:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="grid h-10 w-10 place-items-center border border-stroke-default text-content-secondary hover:bg-white/[0.04] hover:text-content-primary md:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>

        <IconButton
          type="button"
          onClick={onToggleSidebar}
          className="hidden border-stroke-default bg-white/[0.02] text-content-secondary hover:bg-white/[0.04] md:inline-flex"
          tooltip={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </IconButton>

        <div className="min-w-0 flex-1">
          <p className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary sm:block">
            {routeTitle.eyebrow}
          </p>
          <h1 className="truncate font-display text-lg font-semibold leading-6 text-content-primary sm:text-xl">
            {routeTitle.title}
          </h1>
        </div>

        <Link
          href="/dashboard/releases/new"
          className="hidden h-10 items-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse shadow-[0_18px_36px_-28px_rgba(62,207,142,0.55)] hover:bg-brand-hover sm:inline-flex"
        >
          <Plus className="h-4 w-4" />
          <span>New release</span>
        </Link>

        <div className="grid h-10 w-10 place-items-center border border-stroke-default bg-bg-elevated text-sm font-semibold text-content-primary">
          {userInitial}
        </div>
      </div>
    </header>
  );
}
