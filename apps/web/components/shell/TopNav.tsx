'use client';

import { hasPullReveal, revealListSearch } from '@/components/shared/PullReveal';
import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@urganize/ui';
import { Search } from '@/components/icons';
import { NotificationsBell } from '@/components/app/NotificationsBell';
import { HelpMenu } from '@/components/app/HelpMenu';
import { WorkspaceMenu } from '@/components/app/WorkspaceMenu';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { activeShellArea, buildShellAreas, readShellFlags } from '@/lib/shell-nav';
import { useShellStore } from '@/stores/useShellStore';
import { useHomeChatStore } from '@/stores/useHomeChatStore';
import { CreditsChip } from './CreditsChip';
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
 * Every destination comes from lib/shell-nav.ts, so what is offered here, in the
 * sub-tab row and on a phone cannot disagree.
 */
export function TopNav({ userName }: { userName?: string }) {
  const pathname = usePathname() ?? '/dashboard';
  const areas = useMemo(() => buildShellAreas(readShellFlags()), []);
  const active = activeShellArea(areas, pathname);
  const openCommand = useShellStore((state) => state.openCommand);
  const tip = useNavTip();
  const listCollapsed = useHomeChatStore((state) => state.listCollapsed);
  useArtistFilterSync();
  // The UrgAns tab on a phone has no header row at all (2026-10-11, founder
  // call): with only search left on the phone bar, it goes too, so the chat's
  // Sessions / New session row sits at the top. Only the safe-area padding
  // stays. Keep in step with .chappi-shell-height-nav in globals.css.
  const isUrgansPage = pathname === '/dashboard/urgans' || pathname.startsWith('/dashboard/urgans/');

  return (
    <header className="shell-band sticky top-0 z-30 pt-[env(safe-area-inset-top,0px)]">
      <div
        className={`mx-auto h-14 w-full max-w-[1440px] items-center gap-2 px-3 sm:gap-3 sm:px-5 lg:grid lg:h-[72px] lg:grid-cols-[1fr_auto_1fr] lg:px-8 ${
          isUrgansPage ? 'hidden' : 'flex'
        }`}
      >
        {/* Desktop only: the phone bar stays search alone. At lg and up the
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
            className="motion-focus motion-press inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-stroke-default bg-bg-surface/70 px-2.5 text-sm text-content-secondary hover:text-content-primary sm:px-3 lg:h-10 lg:min-w-0"
          >
            <Search className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
          <span className="hidden lg:contents">
            <CreditsChip />
          </span>
          <span className="hidden xl:contents">
            <HelpMenu />
          </span>
          {/* Mounted at every width (see the note above); its own button is
              desktop only and More opens its panel on a phone. */}
          <NotificationsBell />
          <WorkspaceMenu userName={userName} className="hidden lg:block" />
        </div>
      </div>
    </header>
  );
}
