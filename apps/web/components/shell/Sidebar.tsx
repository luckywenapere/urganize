'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';
import {
  Building2,
  Disc3,
  Mic,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  type LucideProps,
} from '@/components/icons';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { readPersistedState } from '@/lib/persisted-state';
import { shellSideMenu } from '@/lib/shell-nav';
import { useShellAreas } from './useShellAreas';
import { SIDEBAR_COLLAPSED_KEY, SIDEBAR_COLLAPSED_VERSION } from '@/lib/sidebar-width';
import { useSidebarStore } from '@/stores/useSidebarStore';
import { useNavTip } from './useNavTip';
import { WorkspaceMenu } from '@/components/app/WorkspaceMenu';
import { useGlide } from '@/lib/use-glide';

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
 * Since 2026-10-17 the profile icon sits at its foot (see Sidebar below), and
 * a page with no side menu gets a slim rail holding just that icon.
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

/** One mark per side-menu page (2026-10-16, founder: rows need icons, like
 *  the Spotify for Artists side menu). Same marks the rest of the app uses for
 *  these things: Disc3 is a rollout everywhere (bottom bar, command bar). */
const PAGE_ICON: Record<string, ComponentType<LucideProps>> = {
  releases: Disc3,
  artists: Mic,
  notes: NotebookPen,
  directory: Building2,
  people: Users,
};

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

/** Fold the side menu away or bring it back. Sits at the foot of the side
 *  menu, and of the thin rail left when it is folded, so it is in the same
 *  corner in both states (2026-10-16, founder: "should be at the bottom", the
 *  usual collapse-button spot). Draws nothing on a page with no menu. */
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
      className="motion-focus motion-press grid h-9 w-9 shrink-0 place-items-center rounded-lg text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
    >
      {collapsed ? (
        <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden="true" />
      ) : (
        <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden="true" />
      )}
    </button>
  );
}

type SidebarProps = {
  /** The account menu's name and help rows, as the top bar used to get them
   *  (WorkspaceFrame's workspaceUserName and showHelpMenu). */
  userName?: string;
  showHelp?: boolean;
};

/**
 * The profile icon lives at the foot of the side menu (2026-10-17, founder,
 * after Apple Music's sidebar: "move the profile icon to the menu at the bottom
 * left. when the menu is collapsed the profile icon just goes above the
 * collapse button in a smooth animation").
 *
 *   open menu    the icon and the name as the last row, the fold button
 *                beside it at the right
 *   folded menu  the icon centred in the rail, directly above the fold button
 *   no menu      (Home, UrgAns, Opportunities, Settings) a slim 64px rail
 *                holding only the icon at the foot, so it is in the same
 *                corner on every desktop page (founder chose this over
 *                leaving it in the top bar there, 2026-10-17)
 *
 * The menu itself snaps between its widths as before; the icon and the fold
 * button glide to their new spots (lib/use-glide.ts), and nothing moves
 * under prefers-reduced-motion. The account menu opens upward from the open
 * menu and to the right from the rail. `lg` and up only, like the rest of
 * this file: a phone keeps Settings and the help rows in the bottom bar's
 * More sheet, unchanged.
 */
export function Sidebar({ userName, showHelp = false }: SidebarProps = {}) {
  const pathname = usePathname() ?? '/dashboard';
  const areas = useShellAreas();
  const menu = shellSideMenu(areas, pathname);
  const collapsed = useSidebarStore((state) => state.collapsed);
  const hydrateCollapsed = useSidebarStore((state) => state.hydrateCollapsed);
  const tip = useNavTip({ prefer: 'right' });
  // Glide only on the user's own fold or unfold, never when a stored choice
  // is applied on load.
  const toggles = useSidebarStore((state) => state.toggles);
  const toggleRef = useRef<HTMLDivElement>(null);
  useGlide(toggleRef, toggles);

  // Read once on mount, never during render, so the first paint matches the
  // server's (expanded) and a stored choice applies straight after.
  useEffect(() => {
    const stored = readPersistedState(SIDEBAR_COLLAPSED_KEY, SIDEBAR_COLLAPSED_VERSION, isBoolean);
    if (stored !== null) hydrateCollapsed(stored);
  }, [hydrateCollapsed]);

  // One element in every state, so the account menu and the fold button stay
  // mounted (and can glide) when the menu folds or opens.
  const mode: 'expanded' | 'collapsed' | 'rail' = !menu ? 'rail' : collapsed ? 'collapsed' : 'expanded';
  const asideClass =
    mode === 'expanded'
      ? 'app-sidebar w-60 overflow-x-hidden pl-4 pr-2'
      : 'w-16 items-center';

  return (
    <aside
      aria-label={menu ? menu.area.label : 'Account'}
      data-sidebar={mode}
      className={`sticky top-[calc(72px+env(safe-area-inset-top,0px))] hidden h-[calc(100dvh-72px-env(safe-area-inset-top,0px))] shrink-0 self-start flex-col py-4 lg:flex ${asideClass}`}
    >
      {menu && mode === 'collapsed' ? (
        // Folded: a thin rail of the pages' marks.
        <nav aria-label={menu.area.label} className="min-h-0 flex-1 overflow-y-auto">
          <ul className="flex flex-col items-center gap-1">
            {menu.pages.map((page) => {
              const Icon = PAGE_ICON[page.key];
              return (
                <li key={page.key}>
                  <Link
                    href={page.href}
                    {...tip.bind(page.key)}
                    onClick={page.key === 'releases' ? leaveReleaseForCatalog : undefined}
                    aria-label={page.label}
                    aria-current={page.active ? 'page' : undefined}
                    className={`motion-focus grid h-10 w-10 place-items-center rounded-lg transition-colors ${
                      page.active
                        ? 'bg-bg-hover text-content-primary'
                        : 'text-content-tertiary hover:bg-bg-hover/60 hover:text-content-primary'
                    }`}
                  >
                    {Icon ? (
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <span className="text-sm font-semibold">{page.label.charAt(0)}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {tip.panel}
        </nav>
      ) : null}
      {menu && mode === 'expanded' ? (
        <nav aria-label={menu.area.label} className="min-h-0 flex-1 overflow-y-auto">
          <ul className="flex flex-col gap-0.5">
            {menu.pages.map((page) => (
              <li key={page.key} className="group/page">
                <Link
                  href={page.href}
                  {...tip.bind(page.key)}
                  onClick={page.key === 'releases' ? leaveReleaseForCatalog : undefined}
                  aria-current={page.active ? 'page' : undefined}
                  data-active={page.active ? 'true' : undefined}
                  className={`motion-focus flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-[color,background-color,opacity] ${
                    page.active
                      ? // Inside a rollout the lit row is the rollout's page
                        // under this one, so the parent keeps its weight but
                        // drops its fill: one lit row, not two.
                        'bg-bg-hover text-content-primary group-has-[[data-rollout-slot]:not(:empty)]/page:bg-transparent group-has-[[data-rollout-slot]:not(:empty)]/page:font-semibold'
                      : 'text-content-secondary opacity-60 hover:bg-bg-hover/60 hover:text-content-primary hover:opacity-100'
                  }`}
                >
                  {(() => {
                    const Icon = PAGE_ICON[page.key];
                    return Icon ? <Icon className="h-5 w-5 shrink-0" aria-hidden="true" /> : null;
                  })()}
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
      ) : null}
      {!menu ? <div className="flex-1" aria-hidden="true" /> : null}
      {/* The foot: the profile icon, and the fold button when there is a menu
          to fold. A row when open, a column (icon above the button) when
          folded. */}
      <div
        data-sidebar-foot
        className={`flex shrink-0 pt-2 ${
          mode === 'expanded' ? 'items-center gap-1' : 'flex-col items-center gap-2'
        }`}
      >
        <WorkspaceMenu
          userName={userName}
          showHelp={showHelp}
          placement={mode === 'expanded' ? 'row' : 'rail'}
          glideKey={toggles}
          className={mode === 'expanded' ? 'min-w-0 flex-1' : undefined}
        />
        {menu ? (
          <div ref={toggleRef} className="shrink-0">
            <SidebarToggle />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
