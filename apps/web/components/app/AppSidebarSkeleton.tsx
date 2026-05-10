'use client';

import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

type AppSidebarSkeletonProps = {
  pathname?: string;
};

const navItems = [
  '/dashboard',
  '/dashboard/releases',
  '/dashboard/tasks',
  '/dashboard/folders',
  '/dashboard/settings/team',
  '/settings',
];

const isActivePath = (pathname: string, href: string) =>
  (href === '/dashboard' && pathname === href) ||
  (href === '/dashboard/releases' && pathname.startsWith('/dashboard/releases')) ||
  (href === '/dashboard/tasks' && pathname.startsWith('/dashboard/tasks')) ||
  (href === '/dashboard/folders' && pathname.startsWith('/dashboard/folders')) ||
  (href === '/dashboard/settings/team' && pathname.startsWith('/dashboard/settings/team')) ||
  (href === '/settings' && pathname.startsWith('/settings')) ||
  (href === '/dashboard/releases' && pathname.startsWith('/dashboard/plans/'));

function SidebarItemSkeleton({
  active = false,
  labelWidth,
}: {
  active?: boolean;
  labelWidth: string;
}) {
  return (
    <div
      className={`flex min-h-[52px] items-center gap-3 rounded-none px-4 ${
        active
          ? 'border border-stroke-default bg-bg-sidebar-active text-content-primary shadow-[0_14px_30px_-22px_rgba(0,0,0,0.5)]'
          : 'border border-transparent bg-transparent'
      }`}
    >
      <div
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center ${
          active ? 'text-content-inverse/80' : 'text-content-tertiary'
        }`}
      >
        <div
          className={`rounded-none ${
            active ? 'h-4 w-4 skeleton-shimmer' : 'h-4 w-4 border border-stroke-subtle bg-bg-elevated/85'
          }`}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div
          className={`h-3.5 rounded-none ${
            active ? `${labelWidth} skeleton-shimmer` : `${labelWidth} skeleton-shimmer`
          }`}
        />
      </div>
    </div>
  );
}

export function AppSidebarSkeleton({ pathname = '' }: AppSidebarSkeletonProps) {
  const activeIndex = navItems.findIndex((href) => isActivePath(pathname, href));

  return (
    <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 md:block" aria-hidden="true">
      <div className="flex h-full flex-col border-r border-stroke-subtle bg-bg-sidebar/95">
        <div className="flex h-16 items-center border-b border-stroke-subtle px-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center border border-stroke-default bg-bg-elevated/85">
              <div className="h-4 w-4 skeleton-shimmer" />
            </div>
            <SkeletonBlock className="h-5 w-28 rounded-none" />
          </div>
        </div>

        <nav className="flex-1 p-2">
          <div className="space-y-1">
            <SidebarItemSkeleton active={activeIndex === 0} labelWidth="w-20" />
            <SidebarItemSkeleton active={activeIndex === 1} labelWidth="w-16" />
            <SidebarItemSkeleton active={activeIndex === 2} labelWidth="w-14" />
            <SidebarItemSkeleton active={activeIndex === 3} labelWidth="w-14" />
            <SidebarItemSkeleton active={activeIndex === 4} labelWidth="w-12" />
            <SidebarItemSkeleton active={activeIndex === 5} labelWidth="w-16" />
          </div>
        </nav>
      </div>
    </aside>
  );
}
