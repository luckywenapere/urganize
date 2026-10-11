'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { NAV_TIP_TOUCH_CLASS, useNavTip } from './useNavTip';
import { activeShellArea, buildShellAreas, readShellFlags, visibleSubTabs } from '@/lib/shell-nav';

/**
 * The second row under the top bar: the tabs of the area you are in (Deel's
 * "People, Org chart, Time off..." strip). It draws nothing when the area has
 * only one tab, because a row with a single choice is just noise.
 *
 * On a phone it scrolls sideways instead of wrapping, and the active tab is
 * kept in view so a deep link never lands with its own tab off screen.
 */
export const SUBNAV_SLOT_START = 'subnav-slot-start';
export const SUBNAV_SLOT_END = 'subnav-slot-end';

export function SubNav() {
  const pathname = usePathname() ?? '/dashboard';
  const areas = useMemo(() => buildShellAreas(readShellFlags()), []);
  const tabs = visibleSubTabs(activeShellArea(areas, pathname));
  const tip = useNavTip();
  if (tabs.length === 0) return null;

  return (
    <nav aria-label="Section" className="shell-band-sub">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-3 px-3 sm:px-5 lg:px-8">
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
        {/* Pages can portal a quiet summary (e.g. "Total 14 rollouts") here. */}
        <div id={SUBNAV_SLOT_START} className="flex shrink-0 items-center empty:hidden" />
        {tip.panel}
      </div>
      {/* Pages can portal their primary action (e.g. Add rollout) here. */}
      <div id={SUBNAV_SLOT_END} className="flex shrink-0 items-center empty:hidden" />
      </div>
    </nav>
  );
}
