'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';
import {
  Building2,
  Disc3,
  NotebookPen,
  User,
  Users,
  type LucideProps,
} from '@/components/icons';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { shellSideMenu } from '@/lib/shell-nav';
import { useShellAreas } from './useShellAreas';
import { useNavTip } from './useNavTip';
import { WorkspaceMenu } from '@/components/app/WorkspaceMenu';

/**
 * The desktop side menu (URG-254, 2026-10-14; design review with Femi,
 * 2026-10-13: the top pills, the tab row and the page were three stacked
 * horizontal layers, which is too much to read).
 *
 * Founder call (2026-10-14, after two other cuts): the areas STAY across the
 * top, centred, exactly as the top bar had them. The side menu is one level
 * down: the open area's pages (Catalogue: Rollouts, Artists, Notes).
 *
 * An area with one page (Home) has no side menu at all; the page
 * takes the full width (shellSideMenu).
 *
 * Since 2026-10-17 the profile icon sits at its foot (see Sidebar below), and
 * a page with no side menu gets a slim rail holding just that icon.
 *
 * `lg` and up only. Below `lg` nothing here renders, and the phone keeps its
 * bottom bar and its tab row exactly as they were.
 *
 * Since 2026-10-26 (founder: "this bar should not be openable") it is always
 * the thin rail of page marks: no fold button, no open state. A rollout's menu
 * is the row of tabs under its header.
 */

/** One mark per side-menu page (2026-10-16, founder: rows need icons, like
 *  the Spotify for Artists side menu). Same marks the rest of the app uses for
 *  these things: Disc3 is a rollout everywhere (bottom bar, command bar). */
const PAGE_ICON: Record<string, ComponentType<LucideProps>> = {
  releases: Disc3,
  // A person figure (2026-10-26, founder), not the mic.
  artists: User,
  notes: NotebookPen,
  directory: Building2,
  people: Users,
};

type SidebarProps = {
  /** The account menu's name and help rows, as the top bar used to get them
   *  (WorkspaceFrame's workspaceUserName and showHelpMenu). */
  userName?: string;
  showHelp?: boolean;
  /** False under the swipe navigation (URG-380): its top bar already holds
   *  the avatar, so a page with no menu draws no rail at all. */
  account?: boolean;
};

/**
 * The profile icon lives at the foot of the side menu (2026-10-17, founder,
 * after Apple Music's sidebar: "move the profile icon to the menu at the bottom
 * left. when the menu is collapsed the profile icon just goes above the
 * collapse button in a smooth animation").
 *
 *   menu         the icon centred at the foot of the rail of page marks
 *   no menu      (Home, UrgAns, Opportunities, Settings) a slim 64px rail
 *                holding only the icon at the foot, so it is in the same
 *                corner on every desktop page (founder chose this over
 *                leaving it in the top bar there, 2026-10-17)
 *
 * The account menu opens to the right from the rail. `lg` and up only, like the rest of
 * this file: a phone keeps Settings and the help rows in the bottom bar's
 * More sheet, unchanged.
 */
export function Sidebar({ userName, showHelp = false, account = true }: SidebarProps = {}) {
  const pathname = usePathname() ?? '/dashboard';
  const areas = useShellAreas();
  const menu = shellSideMenu(areas, pathname);
  const tip = useNavTip({ prefer: 'right' });

  const mode: 'collapsed' | 'rail' = menu ? 'collapsed' : 'rail';
  // No overflow clip on the aside: the account menu opens past the rail.
  // z-20: the sticky aside is its own stacking context, so the menu's z-50 was
  // trapped inside it and the page's `relative` cards (Home's Next card) drew
  // over the menu's top rows. Stays under the top bar (z-30) and modals.

  // The swipe navigation's pages with no menu: the avatar is in its top bar,
  // so there is nothing left for the rail to hold.
  if (!account && !menu) return null;

  return (
    <aside
      aria-label={menu ? menu.area.label : 'Account'}
      data-sidebar={mode}
      className="sticky z-20 top-[calc(72px+env(safe-area-inset-top,0px))] hidden h-[calc(100dvh-72px-env(safe-area-inset-top,0px))] w-16 shrink-0 self-start flex-col items-center py-4 lg:flex"
    >
      {menu ? (
        // A thin rail of the pages' marks.
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
      {!menu ? <div className="flex-1" aria-hidden="true" /> : null}
      <div data-sidebar-foot className="flex shrink-0 flex-col items-center pt-2">
        {account ? <WorkspaceMenu userName={userName} showHelp={showHelp} placement="rail" /> : null}
      </div>
    </aside>
  );
}
