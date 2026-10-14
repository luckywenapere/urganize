'use client';

import { hasPullReveal, revealListSearch } from '@/components/shared/PullReveal';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@urganize/ui';
import { Search } from '@/components/icons';
import { NotificationsBell } from '@/components/app/NotificationsBell';
import { WorkspaceMenu } from '@/components/app/WorkspaceMenu';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { activeShellArea } from '@/lib/shell-nav';
import { useShellAreas } from './useShellAreas';
import { useShellStore } from '@/stores/useShellStore';
import { useHomeChatStore } from '@/stores/useHomeChatStore';
import { useArtistFilterSync } from './useArtistFilter';
import { useNavTip } from './useNavTip';

/**
 * The top bar (design overhaul, 2026-10-04): the Deel shell with Urganize's skin.
 *
 * 2026-10-11, founder call: the top-left block (the Urganize mark and the team
 * and artist label beside it) is gone on every screen, at every width. On a
 * desktop the bar is the six areas as pills on the left, then search, credits,
 * help, notifications ("live") and the account menu on the right. On a phone
 * (below `lg`, where the bottom bar carries the areas) it is the search button
 * alone, right-aligned in a short row; notifications, the account menu, credits
 * and the artist filter that used to sit here all live in the bottom bar's More
 * sheet. The bell itself stays MOUNTED on a phone, only its button is hidden,
 * because it also runs the realtime subscription that toasts a new notification
 * and it draws the panel More opens.
 *
 * Later the same day (2026-10-11, founder call) the Urganize mark came back on
 * a DESKTOP only (`lg` and up), at the far left before the area pills, linking
 * to Home as it did before. The team and artist label stays gone (it lives in
 * the account menu), and the phone bar is unchanged: search alone, and no row
 * at all on the UrgAns tab.
 *
 * Later again that day (2026-10-11, founder call) the area pills went back to
 * the centre of the desktop bar, where they sat before the top-left block was
 * removed (then a `mx-auto` nav between the mark and the icons). They are now
 * truly centred in the bar: a three-column grid at `lg` and up, mark left,
 * pills centre, icons right. The phone bar is untouched.
 *
 * Rollout context is no longer in the bar: a rollout's own screen names it.
 * The artist filter the label opened is in the account menu (desktop) and More
 * (phone); useArtistFilterSync keeps it hydrated on every screen.
 *
 * The soft tinted band behind it is the brand colour at a whisper, Deel's
 * lavender done in spring green; it fades into the page so the bar reads as part
 * of the surface and not a fixed slab on top of it. That tint is desktop only
 * (2026-10-11, founder call): on a phone it read as an odd gradient behind the
 * lone search button, so below `lg` the band is the plain page ground
 * (.shell-band in globals.css).
 *
 * And later still (2026-10-11, founder call: "it looks bad") the phone bar
 * went altogether, on every screen, the way it had already gone on the UrgAns
 * tab. Below `lg` the header is its safe-area top padding and nothing else, so
 * content clears the iOS status bar and notch and starts right under it.
 * Search moved to the first row of the bottom bar's More sheet (BottomBar.tsx);
 * the keyboard shortcut and the command palette are unchanged. The row itself
 * stays in the DOM at zero height below `lg`, every visible piece of it hidden,
 * because the notifications bell inside it must stay mounted (its realtime
 * subscription, and the panel More opens is drawn from here). The desktop bar
 * is exactly as it was.
 *
 * URG-255 (2026-10-14; design review with Femi, 2026-10-13: credits, help,
 * the bell and search all competed for the eye): the right of the bar is now
 * search, a plain outline bell and the account menu, nothing else. The credits
 * chip is gone (the balance is a row in the account menu, with a warning dot
 * on its icon when low) and so is the `?` button (its rows are in the account
 * menu too, behind the same showHelpMenu gate). The pills stay centred
 * (founder call, 2026-10-14: "i even liked the central layout of the top
 * menu"); the open area's pages moved from the tab row under this bar into
 * the side menu (Sidebar.tsx), and the page's name and tools into the page
 * bar above the page (PageBar.tsx).
 *
 * Every destination comes from lib/shell-nav.ts, so what is offered here, in the
 * sub-tab row and on a phone cannot disagree.
 */
export function TopNav({ userName, showHelp = false }: { userName?: string; showHelp?: boolean }) {
  const pathname = usePathname() ?? '/dashboard';
  const areas = useShellAreas();
  const active = activeShellArea(areas, pathname);
  const openCommand = useShellStore((state) => state.openCommand);
  const tip = useNavTip();
  const listCollapsed = useHomeChatStore((state) => state.listCollapsed);
  useArtistFilterSync();

  return (
    <header className="shell-band sticky top-0 z-30 pt-[env(safe-area-inset-top,0px)]">
      <div
        className="mx-auto flex h-0 w-full max-w-[1440px] items-center gap-2 px-3 sm:gap-3 sm:px-5 lg:grid lg:h-[72px] lg:grid-cols-[1fr_auto_1fr] lg:px-8"
      >
        {/* Desktop only: there is no phone bar (h-0 below lg, every visible
            child hidden there; see the note above). At lg and up the
            row is a three-column grid (1fr auto 1fr): the mark in the left
            column, the area pills in the middle one, the icons in the right.
            The two side columns share the leftover width equally, so the pills
            sit at the true centre of the bar, and neither side column can
            shrink below its own content, so at the narrowest lg widths the
            pills give up a few pixels of centring rather than overlap the mark
            or the icons. */}
        <Link
          href="/dashboard/home"
          aria-label="Urganize home"
          className="motion-focus hidden shrink-0 justify-self-start rounded-md transition-opacity hover:opacity-80 lg:inline-flex"
        >
          <Logo size="sm" priority className="opacity-95" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex xl:gap-1">
          {areas.map((area) => {
            // With Home's left column folded away the pill reads as off, so it
            // says the column is hidden and pressing it brings it back.
            const isActive = active?.key === area.key && !(area.key === 'home' && listCollapsed);
            return (
              <Link
                key={area.key}
                href={area.href}
                {...tip.bind(area.key)}
                onClick={(event) => {
                  if (area.key === 'catalogue') leaveReleaseForCatalog();
                  // On Home, the Home pill folds Home's left column away so the
                  // chat fills the width; pressing it again brings it back.
                  if (area.key === 'home' && pathname === area.href) {
                    event.preventDefault();
                    useHomeChatStore.getState().toggleListCollapsed();
                  }
                }}
                aria-current={isActive ? 'page' : undefined}
                aria-expanded={area.key === 'home' && pathname === area.href ? !listCollapsed : undefined}
                aria-controls={area.key === 'home' && pathname === area.href ? 'home-list-column' : undefined}
                data-tour={area.key === 'catalogue' ? 'nav-catalog' : `shell-${area.key}`}
                className={`motion-focus motion-press inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-2.5 text-sm font-medium transition-colors xl:px-3.5 ${
                  isActive
                    ? 'bg-bg-surface text-content-primary shadow-sm ring-1 ring-stroke-default'
                    : 'text-content-secondary hover:bg-bg-hover/70 hover:text-content-primary'
                }`}
              >
                {area.label}
              </Link>
            );
          })}
          {tip.panel}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 justify-self-end sm:gap-2">
          <button
            type="button"
            onClick={() => (hasPullReveal() ? revealListSearch() : openCommand())}
            data-tour="shell-search"
            aria-label="Search or ask UrgAns"
            className="motion-focus motion-press hidden h-10 items-center justify-center gap-2 rounded-full border border-stroke-default bg-bg-surface/70 px-3 text-sm text-content-secondary hover:text-content-primary lg:inline-flex"
          >
            <Search className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
          {/* Mounted at every width (see the note above); its own button is
              desktop only and More opens its panel on a phone. The search
              button before it is desktop only too: on a phone search is the
              first row of More. */}
          <NotificationsBell />
          <WorkspaceMenu userName={userName} showHelp={showHelp} className="hidden lg:block" />
        </div>
      </div>
    </header>
  );
}
