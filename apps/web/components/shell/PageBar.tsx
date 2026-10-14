'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { buildShellAreas, readShellFlags, shellPageTitle, shellSideMenu } from '@/lib/shell-nav';
import { SidebarToggle } from './Sidebar';
import { SUBNAV_SLOT_END, SUBNAV_SLOT_START, SUBNAV_SLOT_TOOLS } from './SubNav';

/**
 * The line above the page on a computer (URG-254, 2026-10-14): the button that
 * folds the side menu, the page's name, then the page's own tools, which pages
 * portal in (a count, a list's search and filters, its one primary action).
 * Those slots sat in the tab row before; with the tabs in the side menu this
 * line is what is left of that row, inside the page column rather than a band
 * across the screen. The slot ids keep their SubNav names so no page changed.
 *
 * `lg` and up only. On a phone the tab row (SubNav) is unchanged and pages
 * keep their tools in the page.
 */
export function PageBar() {
  const pathname = usePathname() ?? '/dashboard';
  const areas = useMemo(() => buildShellAreas(readShellFlags()), []);
  const title = shellPageTitle(areas, pathname);
  // With a side menu the bar always shows (it holds the fold button). Without
  // one (Home, Pitching) it shows only when the page put tools in it, so Home
  // does not gain an empty line with its own name on it.
  const always = shellSideMenu(areas, pathname) !== null;

  return (
    <div
      className={`hidden h-14 min-w-0 items-center gap-3 ${
        always ? 'lg:flex' : 'lg:has-[>[id^=subnav-slot]:not(:empty)]:flex'
      }`}
    >
      <SidebarToggle />
      {title ? <p className="min-w-0 shrink-0 truncate text-[15px] font-semibold text-content-primary">{title}</p> : null}
      <div id={SUBNAV_SLOT_START} className="flex shrink-0 items-center empty:hidden" />
      <div className="flex-1" />
      <div id={SUBNAV_SLOT_TOOLS} className="flex min-w-0 shrink items-center empty:hidden" />
      <div id={SUBNAV_SLOT_END} className="flex shrink-0 items-center empty:hidden" />
    </div>
  );
}
