'use client';

import { hasPullReveal, revealListSearch } from '@/components/shared/PullReveal';
import { useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from '@urganize/ui';
import { Search } from '@/components/icons';
import { NotificationsBell } from '@/components/app/NotificationsBell';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { markNavigationBlocked } from '@/lib/nav-stall-watch';
import { HOME_HREF, activeShellArea } from '@/lib/shell-nav';
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
 * UrgAns pill (founder, 2026-10-15): right after Home. Pressing Home while on
 * Home folds Home's left column so the chat fills the width; that view IS
 * UrgAns, so the UrgAns pill lights instead of Home and takes keyboard focus.
 * Pressing UrgAns anywhere opens that same view (Home, chat full width);
 * pressing Home brings Home's column back.
 *
 * The account menu left the bar (2026-10-17, founder, after Apple Music): the
 * profile icon sits at the foot of the side menu now (Sidebar.tsx), on every
 * desktop page. The right of the bar is search and the bell.
 *
 * Every destination comes from lib/shell-nav.ts, so what is offered here, in the
 * sub-tab row and on a phone cannot disagree.
 */
export function TopNav() {
  const pathname = usePathname() ?? '/dashboard';
  const areas = useShellAreas();
  const active = activeShellArea(areas, pathname);
  const openCommand = useShellStore((state) => state.openCommand);
  const tip = useNavTip();
  const listCollapsed = useHomeChatStore((state) => state.listCollapsed);
  const router = useRouter();
  const urgansPill = useRef<HTMLAnchorElement | null>(null);
  const onHome = pathname === HOME_HREF;
  // Home with its column folded: the chat fills the screen, which is UrgAns.
  const urgansOpenOnHome = onHome && listCollapsed;
  // After the view switches, the pill that now names it takes focus.
  const focusUrgans = () => requestAnimationFrame(() => urgansPill.current?.focus());
  useArtistFilterSync();

  return (
    <header data-shell-topbar className="shell-band sticky top-0 z-30 pt-[env(safe-area-inset-top,0px)]">
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
        {/* Beta label beside the mark (2026-10-15, founder call, URG-311):
            Urganize stays on 1.x versions, so this pill is what says the
            product is still early. One app-wide label here, not per-feature
            stamps (those all went 2026-08-16). Desktop only, like the mark. */}
        <div className="hidden shrink-0 items-center gap-2 justify-self-start lg:inline-flex">
          <Link
            href="/dashboard/home"
            aria-label="Urganize home"
            className="motion-focus inline-flex rounded-md transition-opacity hover:opacity-80"
          >
            <Logo size="sm" priority className="opacity-95" />
          </Link>
          <span className="select-none rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
            Beta
          </span>
        </div>

        <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex xl:gap-1">
          {areas.map((area) => {
            // With Home's left column folded away the pill reads as off, so it
            // says the column is hidden and pressing it brings it back.
            const isActive =
              area.key === 'urgans'
                ? active?.key === 'urgans' || urgansOpenOnHome
                : active?.key === area.key && !(area.key === 'home' && listCollapsed);
            return (
              <Link
                key={area.key}
                href={area.href}
                ref={area.key === 'urgans' ? urgansPill : undefined}
                {...tip.bind(area.key)}
                onClick={(event) => {
                  if (area.key === 'catalogue') leaveReleaseForCatalog();
                  if (area.key === 'home') {
                    if (onHome) {
                      // On Home, the Home pill folds Home's left column away so
                      // the chat fills the width (UrgAns, which lights and takes
                      // focus); pressing it again brings the column back.
                      event.preventDefault();
                      markNavigationBlocked(event.nativeEvent);
                      const willCollapse = !listCollapsed;
                      useHomeChatStore.getState().setListCollapsed(willCollapse);
                      if (willCollapse) focusUrgans();
                    } else {
                      // Arriving from elsewhere, Home opens as Home.
                      useHomeChatStore.getState().setListCollapsed(false);
                    }
                  }
                  if (area.key === 'urgans' && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
                    // The UrgAns pill opens Home's chat full width.
                    event.preventDefault();
                    // Already on Home the address never changes, so tell the
                    // link watchdog (lib/nav-stall-watch.ts) this click was
                    // handled. Unmarked, it saw a link to /dashboard/urgans
                    // that "never landed" and hard-loaded that page 7 seconds
                    // later, which on a computer sends you back to Home with
                    // the column open: UrgAns opened, then popped back to Home
                    // (2026-10-17). From another page the push to Home moves
                    // the address, so the watchdog sees it land.
                    if (onHome) markNavigationBlocked(event.nativeEvent);
                    useHomeChatStore.getState().setListCollapsed(true);
                    if (!onHome) router.push(HOME_HREF);
                    focusUrgans();
                  }
                }}
                aria-current={isActive ? 'page' : undefined}
                aria-expanded={area.key === 'home' && pathname === area.href ? !listCollapsed : undefined}
                aria-controls={area.key === 'home' && pathname === area.href ? 'home-list-column' : undefined}
                data-tour={area.key === 'catalogue' ? 'nav-catalog' : `shell-${area.key}`}
                className={`motion-focus motion-press inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-2.5 text-sm font-medium transition-[color,background-color,opacity] xl:px-3.5 ${
                  isActive
                    ? 'bg-bg-surface text-content-primary shadow-sm ring-1 ring-stroke-default'
                    : 'text-content-secondary opacity-[0.55] hover:bg-bg-hover/70 hover:text-content-primary hover:opacity-100 focus-visible:opacity-100'
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
        </div>
      </div>
    </header>
  );
}
