'use client';

import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

type AppSidebarSkeletonProps = {
  pathname?: string;
};

const navItems = [
  '/dashboard',
  '/dashboard/tasks',
  '/dashboard/notes',
  '/dashboard/pre-save',
  '/dashboard/folders',
];

const isActivePath = (pathname: string, href: string) =>
  pathname === href ||
  (href === '/dashboard/tasks' && pathname.startsWith('/dashboard/tasks')) ||
  (href === '/dashboard/folders' && pathname.startsWith('/dashboard/folders')) ||
  (href === '/dashboard' && pathname.startsWith('/dashboard/plans/')) ||
  (href === '/dashboard' && pathname.startsWith('/dashboard/releases/'));

function SidebarItemSkeleton({
  active = false,
  labelWidth,
}: {
  active?: boolean;
  labelWidth: string;
}) {
  return (
    <div
      className={`flex min-h-[52px] items-center gap-3 rounded-[20px] px-4 ${
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
          className={`rounded-[7px] ${
            active ? 'h-4 w-4 skeleton-shimmer' : 'h-4 w-4 border border-stroke-subtle bg-bg-elevated/85'
          }`}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div
          className={`h-3.5 rounded-full ${
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
    <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 p-4 md:block" aria-hidden="true">
      <div className="flex h-full flex-col gap-4">
        <div className="nav-shell p-4">
          <div className="flex items-center justify-start">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full border border-stroke-default bg-bg-elevated/85">
                <div className="h-4 w-4 rounded-full skeleton-shimmer" />
              </div>
              <SkeletonBlock className="h-5 w-28 rounded-full" />
            </div>
          </div>
        </div>

        <nav className="nav-shell p-2">
          <div className="space-y-2">
            <SidebarItemSkeleton active={activeIndex === 0} labelWidth="w-20" />
            <SidebarItemSkeleton active={activeIndex === 1} labelWidth="w-14" />
            <SidebarItemSkeleton active={activeIndex === 2} labelWidth="w-16" />
            <SidebarItemSkeleton active={activeIndex === 3} labelWidth="w-24" />
            <SidebarItemSkeleton active={activeIndex === 4} labelWidth="w-20" />
          </div>
        </nav>
      </div>
    </aside>
  );
}
