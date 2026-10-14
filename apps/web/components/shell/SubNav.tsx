'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { NAV_TIP_TOUCH_CLASS, useNavTip } from './useNavTip';
import { activeShellArea, visibleSubTabs } from '@/lib/shell-nav';
import { useShellAreas } from './useShellAreas';

/**
 * The row of tabs for the area you are in (Deel's "People, Org chart, Time
 * off..." strip), BELOW `lg` ONLY since URG-254 (2026-10-14): on a computer the
 * top bar carries the tabs on its own line (TopNav.tsx) and this row is gone. It draws
 * nothing when the area has only one tab, because a row with a single choice is
 * just noise.
 *
 * It scrolls sideways instead of wrapping, and the active tab is kept in view
 * so a deep link never lands with its own tab off screen.
 */
/** The slots a page portals its desktop furniture into. They live in the top
 *  bar now (TopNav.tsx), desktop only; the names are kept so pages need no
 *  change. A count or summary ("Total 14 rollouts"). */
export const SUBNAV_SLOT_START = 'subnav-slot-start';
/** The page's primary action (Add rollout). */
export const SUBNAV_SLOT_END = 'subnav-slot-end';
/** A list page's search and filters (ListToolbar), right-aligned before the
 *  primary action (founder mock, 2026-10-11). */
export const SUBNAV_SLOT_TOOLS = 'subnav-slot-tools';

export function SubNav() {
  const pathname = usePathname() ?? '/dashboard';
  const areas = useShellAreas();
  const tabs = visibleSubTabs(activeShellArea(areas, pathname));
  const tip = useNavTip();
  if (tabs.length === 0) return null;

  return (
    <nav aria-label="Section" className="shell-band-sub lg:hidden">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-3 px-3 sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.isActive(pathname);
          return (
            <Link
              key={tab.key}
              href={tab.href}
              {...tip.bind(tab.key)}
              onClick={tab.key === 'releases' ? leaveReleaseForCatalog : undefined}
              aria-current={isActive ? 'page' : undefined}
              ref={(node) => {
                if (node && isActive) node.scrollIntoView?.({ block: 'nearest', inline: 'center' });
              }}
              className={`motion-focus motion-press inline-flex h-10 shrink-0 items-center rounded-lg px-3.5 text-sm font-medium transition-colors ${NAV_TIP_TOUCH_CLASS} ${
                isActive
                  ? 'bg-bg-hover text-content-primary'
                  : 'text-content-secondary hover:bg-bg-hover/60 hover:text-content-primary'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
        {tip.panel}
      </div>
      </div>
    </nav>
  );
}
