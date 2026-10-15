'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen } from '@/components/icons';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { readPersistedState } from '@/lib/persisted-state';
import { shellSideMenu } from '@/lib/shell-nav';
import { useShellAreas } from './useShellAreas';
import { SIDEBAR_COLLAPSED_KEY, SIDEBAR_COLLAPSED_VERSION } from '@/lib/sidebar-width';
import { useSidebarStore } from '@/stores/useSidebarStore';
import { useNavTip } from './useNavTip';

/**
 * The desktop side menu (URG-254, 2026-10-14; design review with Femi,
 * 2026-10-13: the top pills, the tab row and the page were three stacked
 * horizontal layers, which is too much to read).
 *
 * Founder call (2026-10-14, after two other cuts): the areas STAY across the
 * top, centred, exactly as the top bar had them. The side menu is one level
 * down: the open area's pages (Catalogue: Rollouts, Artists,
 * Notes) as its parent rows, and the pages inside a page nested under their
 * parent. Today that is a rollout: with one open, its menu (See the timeline,
 * Work the plan, Talk to the team...) folds open under Rollouts. The rollout
 * screen draws that menu itself and portals it into SIDEBAR_SLOT_ROLLOUT here
 * (RolloutTabs, variant "side"), so the menu keeps every action and dialog it
 * had and this file needs to know nothing about rollouts.
 *
 * An area with one page (Home) has no side menu at all; the page
 * takes the full width (shellSideMenu). Catalogue always has one, because a
 * rollout's menu needs a home even when Rollouts is its only page.
 *
 * `lg` and up only. Below `lg` nothing here renders, and the phone keeps its
 * bottom bar and its tab row exactly as they were.
 *
 * It can be folded away to give the page the full width (the button in the
 * page bar, SidebarToggle), remembered on this device in useSidebarStore (the
 * store the pre-overhaul side menu used, storage version bumped so a choice
 * made in that old menu does not fold this one). Folded, a rollout's menu goes
 * back to being a row of tabs under its header.
 */

export const SIDEBAR_SLOT_ROLLOUT = 'sidebar-slot-rollout';

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/** Whether the side menu is drawn for this page right now: an area that has
 *  one, and not folded away. */
export function useSidebarShown(): boolean {
  const pathname = usePathname() ?? '/dashboard';
  const areas = useShellAreas();
  const collapsed = useSidebarStore((state) => state.collapsed);
  return shellSideMenu(areas, pathname) !== null && !collapsed;
}

/** The element a page portals into the side menu, or null when the side menu
 *  is not on screen (a phone, folded away, or an area without one). */
export function useSidebarSlot(id: string): HTMLElement | null {
  const shown = useSidebarShown();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // The side menu commits in the same pass as the page, so the slot exists
    // by the time this runs. Re-read whenever the menu appears or folds.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlot(shown ? document.getElementById(id) : null);
  }, [id, shown]);
  return slot;
}

/** Fold the side menu away or bring it back. Lives in the page bar so it is
 *  in the same place in both states. Draws nothing on a page with no menu. */
export function SidebarToggle() {
  const pathname = usePathname() ?? '/dashboard';
  const areas = useShellAreas();
  const collapsed = useSidebarStore((state) => state.collapsed);
  const setCollapsed = useSidebarStore((state) => state.setCollapsed);
  if (shellSideMenu(areas, pathname) === null) return null;
  return (
    <button
      type="button"
      onClick={() => setCollapsed(!collapsed)}
      aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
      aria-pressed={collapsed}
      data-tour="shell-sidebar-toggle"
      className="motion-focus motion-press -ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
    >
      {collapsed ? (
        <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden="true" />
      ) : (
        <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden="true" />
      )}
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname() ?? '/dashboard';
  const areas = useShellAreas();
  const menu = shellSideMenu(areas, pathname);
  const collapsed = useSidebarStore((state) => state.collapsed);
  const hydrateCollapsed = useSidebarStore((state) => state.hydrateCollapsed);
  const tip = useNavTip({ prefer: 'right' });

  // Read once on mount, never during render, so the first paint matches the
  // server's (expanded) and a stored choice applies straight after.
  useEffect(() => {
    const stored = readPersistedState(SIDEBAR_COLLAPSED_KEY, SIDEBAR_COLLAPSED_VERSION, isBoolean);
    if (stored !== null) hydrateCollapsed(stored);
  }, [hydrateCollapsed]);

  if (!menu || collapsed) return null;

  return (
    <aside
      aria-label={menu.area.label}
      data-sidebar="expanded"
      className="app-sidebar sticky top-[calc(72px+env(safe-area-inset-top,0px))] hidden max-h-[calc(100dvh-72px-env(safe-area-inset-top,0px))] w-60 shrink-0 self-start overflow-y-auto overflow-x-hidden py-4 pl-4 pr-2 lg:block"
    >
      <nav aria-label={menu.area.label}>
        <ul className="flex flex-col gap-0.5">
          {menu.pages.map((page) => (
            <li key={page.key} className="group/page">
              <Link
                href={page.href}
                {...tip.bind(page.key)}
                onClick={page.key === 'releases' ? leaveReleaseForCatalog : undefined}
                aria-current={page.active ? 'page' : undefined}
                data-active={page.active ? 'true' : undefined}
                className={`motion-focus flex h-10 items-center rounded-lg px-3 text-sm font-medium transition-[color,background-color,opacity] ${
                  page.active
                    ? // Inside a rollout the lit row is the rollout's page
                      // under this one, so the parent keeps its weight but
                      // drops its fill: one lit row, not two.
                      'bg-bg-hover text-content-primary group-has-[[data-rollout-slot]:not(:empty)]/page:bg-transparent group-has-[[data-rollout-slot]:not(:empty)]/page:font-semibold'
                    : 'text-content-secondary opacity-60 hover:bg-bg-hover/60 hover:text-content-primary hover:opacity-100'
                }`}
              >
                <span className="min-w-0 truncate">{page.label}</span>
              </Link>
              {/* A rollout's own menu, nested under Rollouts while one is
                  open (RolloutTabs portals it in). Empty, and so hidden,
                  otherwise. */}
              {page.key === 'releases' ? (
                <div id={SIDEBAR_SLOT_ROLLOUT} data-rollout-slot className="mb-1 mt-1 pl-3 empty:hidden" />
              ) : null}
            </li>
          ))}
        </ul>
        {tip.panel}
      </nav>
    </aside>
  );
}
