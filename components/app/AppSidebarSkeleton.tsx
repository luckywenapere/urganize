'use client';

import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

type AppSidebarSkeletonProps = {
  pathname?: string;
};

const navItems = [
  '/dashboard',
  '/dashboard/songs',
  '/dashboard/notes',
  '/settings',
];

const isActivePath = (pathname: string, href: string) =>
  pathname === href ||
  (href === '/dashboard' && pathname.startsWith('/dashboard/plans/')) ||
  (href === '/dashboard' && pathname.startsWith('/dashboard/releases/')) ||
  (href === '/dashboard/songs' && pathname.startsWith('/dashboard/songs/'));

function SidebarItemSkeleton({
  active = false,
  labelWidth,
  descriptionWidth,
}: {
  active?: boolean;
  labelWidth: string;
  descriptionWidth: string;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-[22px] px-4 py-3 ${
        active
          ? 'bg-brand text-content-inverse shadow-[0_14px_30px_-22px_rgba(0,0,0,0.5)]'
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
            active ? 'h-4 w-4 bg-white/22' : 'h-4 w-4 border border-stroke-subtle bg-bg-elevated/85'
          }`}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div
          className={`h-3.5 rounded-full ${
            active ? `${labelWidth} bg-white/26` : `${labelWidth} skeleton-shimmer bg-bg-overlay/80`
          }`}
        />
        <div
          className={`mt-2 h-3 rounded-full ${
            active ? `${descriptionWidth} bg-white/16` : `${descriptionWidth} skeleton-shimmer bg-bg-overlay/65`
          }`}
        />
      </div>
    </div>
  );
}

export function AppSidebarSkeleton({ pathname = '' }: AppSidebarSkeletonProps) {
  const activeIndex = Math.max(
    navItems.findIndex((href) => isActivePath(pathname, href)),
    0
  );

  return (
    <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 p-5 md:block" aria-hidden="true">
      <div className="flex h-full flex-col">
        <div className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)] backdrop-blur-sm">
          <div className="flex items-center justify-start">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full border border-stroke-default bg-bg-elevated/85">
                <div className="h-4 w-4 rounded-full bg-bg-overlay/90 skeleton-shimmer" />
              </div>
              <SkeletonBlock className="h-5 w-28 rounded-full" />
            </div>
          </div>

          <SkeletonBlock className="mt-3 h-3 w-20 rounded-full" />
          <div className="mt-3 space-y-2">
            <SkeletonBlock className="h-3.5 w-40 rounded-full" />
            <SkeletonBlock className="h-3.5 w-36 rounded-full" />
          </div>
        </div>

        <nav className="mt-5 rounded-[28px] border border-stroke-default bg-bg-surface/95 p-3 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)] backdrop-blur-sm">
          <div className="space-y-1">
            <SidebarItemSkeleton active={activeIndex === 0} labelWidth="w-20" descriptionWidth="w-32" />
            <SidebarItemSkeleton active={activeIndex === 1} labelWidth="w-16" descriptionWidth="w-28" />
            <SidebarItemSkeleton active={activeIndex === 2} labelWidth="w-16" descriptionWidth="w-24" />
            <SidebarItemSkeleton active={activeIndex === 3} labelWidth="w-20" descriptionWidth="w-28" />
          </div>
        </nav>
      </div>
    </aside>
  );
}
