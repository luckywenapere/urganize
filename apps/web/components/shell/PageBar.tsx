'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { shellPageTitle, shellSideMenu } from '@/lib/shell-nav';
import { useShellAreas } from './useShellAreas';
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
/** Where a page swaps the plain title for its own breadcrumb (a rollout:
 *  Rollouts > its name), so where you are is said once. */
export const PAGEBAR_SLOT_CRUMB = 'pagebar-slot-crumb';

/** The page bar's breadcrumb slot, once it is in the document; null on a
 *  phone, where the bar is hidden and a page keeps its own breadcrumb. */
export function usePageBarCrumbSlot(enabled: boolean): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlot(enabled ? document.getElementById(PAGEBAR_SLOT_CRUMB) : null);
  }, [enabled]);
  return slot;
}

/** The page bar's right-end slot (the page's primary action), once it is in
 *  the document; null on a phone, where the bar is hidden. */
export function usePageBarEndSlot(enabled: boolean): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlot(enabled ? document.getElementById(SUBNAV_SLOT_END) : null);
  }, [enabled]);
  return slot;
}

export function PageBar() {
  const pathname = usePathname() ?? '/dashboard';
  const areas = useShellAreas();
  const title = shellPageTitle(areas, pathname);
  // With a side menu the bar always shows (its title or breadcrumb; the fold
  // button moved to the foot of the side menu on 2026-10-16). Without
  // one (Home) it shows only when the page put tools or a crumb in it, so
  // Home does not gain an empty line with its own name on it. The crumb counts
  // (Nov 2, 2026): the brief on a computer puts only its back button there,
  // and with tools alone counting the whole bar, back button included, hid.
  const always = shellSideMenu(areas, pathname) !== null;

  return (
    <div
      className={`group/pagebar hidden h-14 min-w-0 items-center gap-[13px] ${
        always
          ? 'lg:flex'
          : 'lg:has-[>[id^=subnav-slot]:not(:empty)]:flex lg:has-[>[data-crumb-slot]:not(:empty)]:flex'
      }`}
    >
      {title ? (
        <p className="min-w-0 shrink-0 truncate text-[15px] font-semibold text-content-primary group-has-[[data-crumb-slot]:not(:empty)]/pagebar:hidden">
          {title}
        </p>
      ) : null}
      <div id={PAGEBAR_SLOT_CRUMB} data-crumb-slot className="flex min-w-0 items-center empty:hidden" />
      <div id={SUBNAV_SLOT_START} className="flex shrink-0 items-center empty:hidden" />
      <div className="flex-1" />
      <div id={SUBNAV_SLOT_TOOLS} className="flex min-w-0 shrink items-center empty:hidden" />
      <div id={SUBNAV_SLOT_END} className="flex shrink-0 items-center empty:hidden" />
    </div>
  );
}
