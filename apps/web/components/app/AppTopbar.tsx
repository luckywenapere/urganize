'use client';

import { usePathname } from 'next/navigation';
import { Menu, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import { IconButton } from '@urganize/ui';
import { TaskNotificationBell } from '@/components/tasks/TaskNotificationBell';

type AppTopbarProps = {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onOpenMobileSidebar?: () => void;
  /** Opens the release creation modal. Lifted to AppShell so this universal
   * button behaves identically to the page-level "New release" buttons
   * instead of navigating to the releases list. */
  onNewRelease?: () => void;
};

// `/dashboard` is the consolidated workspace. We render NO title / eyebrow
// for it — the workspace IS the page, and a "Home / Workspace" label was
// just redundant. The min-w-0 flex-1 wrapper below stays empty there, which
// keeps the right-side controls flush right without any layout shift.
// Other routes keep their titles. The detail route under
// /dashboard/releases/[releaseId] still uses the Releases startsWith match
// (the list /dashboard/releases 308-redirects to /dashboard and never
// reaches this code).
const routeTitles = [
  { match: (pathname: string) => pathname === '/dashboard', title: '', eyebrow: '' },
  { match: (pathname: string) => pathname.startsWith('/dashboard/releases'), title: 'Release', eyebrow: 'Release detail' },
  { match: (pathname: string) => pathname.startsWith('/settings'), title: 'Settings', eyebrow: 'Account' },
];

function getRouteTitle(pathname: string | null) {
  const safePathname = pathname || '/dashboard';
  return routeTitles.find((item) => item.match(safePathname)) || routeTitles[0];
}

export function AppTopbar({
  isSidebarCollapsed = false,
  onToggleSidebar,
  onOpenMobileSidebar,
  onNewRelease,
}: AppTopbarProps) {
  const pathname = usePathname();
  const routeTitle = getRouteTitle(pathname);

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

        {/* Spacer takes flex-1 so the right-side controls stay flush right.
            Eyebrow + title are conditional so empty routeTitle entries
            (e.g. /dashboard) don't reserve vertical space. */}
        <div className="min-w-0 flex-1">
          {routeTitle.eyebrow ? (
            <p className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary sm:block">
              {routeTitle.eyebrow}
            </p>
          ) : null}
          {routeTitle.title ? (
            <h1 className="truncate font-display text-lg font-semibold leading-6 text-content-primary sm:text-xl">
              {routeTitle.title}
            </h1>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onNewRelease}
          className="hidden h-10 items-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse shadow-[0_18px_36px_-28px_rgba(62,207,142,0.55)] hover:bg-brand-hover sm:inline-flex"
        >
          <Plus className="h-4 w-4" />
          <span>New release</span>
        </button>

        {/* Notifications bell — docked into the topbar's right rail in the
            slot the user avatar previously occupied. Self-sufficient via
            useTaskUI() + TASKS_CHANGED_EVENT (was previously a floating
            fixed-position widget that overlapped workspace content).
            Renders for all authenticated dashboard routes, same as before. */}
        <TaskNotificationBell />
      </div>
    </header>
  );
}
