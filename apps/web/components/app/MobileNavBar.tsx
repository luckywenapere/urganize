'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Inbox, MicVocal } from '@/components/icons';
import { useKeyboardOpen } from '@/lib/keyboard-viewport';
import { useChappiStore } from '@/stores/useChappiStore';
import { useAuthStore } from '@/lib/auth-store';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { CatalogIcon, ChappiIcon } from '@/components/app/BrandIcons';

// Same flags AppTopbar reads — a tab only exists in the bar when its surface
// exists at all.
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';
// Still read here for the curator crossing below (Playlist pitches) — the
// team side of pitching no longer has a tab of its own in this bar.
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';
const EVENTS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EVENTS === 'true';

/**
 * One tab's look, shared by every destination in the bar (2026-08-31). It used
 * to be five inline copies of the same class string, which is the drift this
 * file keeps having to correct elsewhere.
 *
 * LABELS ARE `sr-only` — icons only, to save width (founder call). The string
 * is kept rather than deleted so the accessible name survives: a bar of five
 * unlabelled icon links would announce as five links with no names. Keeping
 * one copy per tab also means the visible icon and the announced name cannot
 * drift apart, the reasoning WorkspaceIdentityPanel's collapsed rail already
 * uses for its own icon-only state.
 *
 * Dropping the labels also retired the width ceiling this bar was measured
 * against: that ceiling was set by the widest LABEL ("Pitches", ~45px), and a
 * 20px glyph in a ~52px slot has room to spare. The limit recorded below is a
 * touch-target question, not a text one.
 */
function tabClass(isActive: boolean): string {
  return `flex h-full w-full flex-col items-center justify-center transition-colors ${
    isActive ? 'text-brand' : 'text-content-tertiary hover:text-content-secondary'
  }`;
}

/** Icon components come from two families — hand-drawn BrandIcons return
 *  ReactElement, the house/lucide sets type theirs as ReactElement | null — so
 *  this is deliberately widened to ReactNode rather than making every icon
 *  need a wrapper (the `MetadataIcon` problem, recorded in CLAUDE.md). */
type TabIcon = (props: { className?: string }) => ReactNode;

/** A plain destination tab, `<li>` included. */
function NavTab({
  href,
  label,
  Icon,
  isActive,
  onClick,
  dataTour,
}: {
  href: string;
  label: string;
  Icon: TabIcon;
  isActive: boolean;
  onClick?: () => void;
  /** Guided-tour anchor (lib/tours.ts). Inert without the flag: it is an
   *  attribute nothing reads until TourOverlay looks for it. */
  dataTour?: string;
}) {
  return (
    <li className="flex-1">
      <Link
        href={href}
        onClick={onClick}
        data-tour={dataTour}
        aria-current={isActive ? 'page' : undefined}
        className={tabClass(isActive)}
      >
        <Icon className="h-5 w-5" />
        <span className="sr-only">{label}</span>
      </Link>
    </li>
  );
}

/**
 * Bottom tab bar, below lg only (NEXT_PUBLIC_FEATURE_MOBILE_NAV). Moves the
 * topbar's nav icons and the "New rollout" CTA down to where a thumb actually
 * reaches on a phone, and stands in for the ChappiDock launcher (which retires
 * on this same viewport range — see ChappiDock.tsx).
 *
 * Slots: Home (Catalog) · UrgAns · Shows, plus Playlist pitches for a dual
 * account. Notes, the team side of Pitching, and Directory are deliberately
 * NOT here — three founder calls in quick succession on 2026-09-25: "remove
 * pitch from the general bottom menu, it should only appear inside the menu
 * in each release" — then "remove notes also" — then "remove directory too
 * from the menu". Notes and Pitching lose nothing: both already lived in
 * every rollout's own folded menu as `'note'` and `'pitch'`
 * (lib/release-menu.ts) the whole time this bar also carried a tab for them.
 * Directory is different — see its own paragraph below. The curator
 * crossing below, "Playlist pitches", stays: it has no release to fold into
 * either, but it is also the only mobile path to that inbox at all, which
 * the founder has not touched.
 *
 * EVERY TAB IS ALWAYS VISIBLE (founder call, 2026-09-05). Which tabs EXIST is
 * decided by feature flags and, for the curator crossing, by whether the
 * account is a dual team+curator one — all of which are fixed for a given
 * account, so the bar
 * holds one shape for a whole session and never rearranges under a thumb that
 * is already moving toward a target. No tab drops out on the view it points
 * at either: the active one lights up instead, which is what `aria-current`
 * and the brand colour are already for. The UrgAns tab stays put on the
 * assistant page, Home stays put on the catalog.
 *
 * That replaced a rule where Home and Song each hid on their own view and left
 * a reserved gap behind (EmptyTabSlot, 2026-08-31). The gap existed to stop
 * the neighbours sliding across; with nothing hiding there is nothing to
 * reserve, so both the hiding and its counterweight are gone.
 *
 * SONG IS NOT HERE (founder call, 2026-09-05). It was the one tab whose
 * destination depended on the URL — `?release=<id>&scene=song` when a release
 * was scoped, the catalog otherwise — which is what made it come and go, and
 * what pulled `useSearchParams` (and therefore a Suspense boundary) into a bar
 * mounted app-wide including on `/settings`, which must stay `○ Static`. It
 * lives in the release folded "more" menu instead, where it is ranked in
 * lib/release-menu.ts and reachable in one tap from any scoped release. That
 * menu is NOT gated on NEXT_PUBLIC_FEATURE_MOBILE_NAV, so removing the tab
 * leaves no viewport or flag band without an entry point — the compounding
 * failure recorded under "Crossing between the two portals".
 *
 * With Song gone, nothing in this component reads search params any more, so
 * there is no Suspense boundary left in the file. Keep it that way: the two
 * click handlers below read `window.location.search` at click time on purpose,
 * because they need an answer once, on demand, rather than a subscription that
 * would drag the whole bar behind a boundary.
 *
 * PRESS KITS IS NOT HERE ANY MORE (founder call, 2026-09-09): "Press kit
 * should only be accessible through settings not visible through the main app
 * view." It held the trailing slot from 2026-09-05 as the outward-facing
 * surface; it is now reached from Settings alone. (The team side of Pitching
 * took the slot briefly after that, then left again too — see below.) The
 * pages did not move, so a link to one still resolves.
 *
 * ICONS ONLY — every tab's label is `sr-only` (founder call, 2026-08-31), to
 * save width. See tabClass above for why the strings are kept rather than
 * deleted.
 *
 * "You" is NOT here. It moved to the topbar's top-left corner on 2026-08-31
 * (founder call). That link is the only route to Settings on a phone; see
 * AppTopbar.
 *
 * THE "+" IS NOT HERE ANY MORE (founder call, 2026-09-06). It moved to the
 * topbar's top-RIGHT corner, opposite the account link that already sits
 * top-left. Its contextual behaviour went with it — quick-create for a scoped
 * release, New rollout everywhere else, which is the job TasksPanel's retired
 * mobile "New activity" pill left behind — so `handleCreateClick` in
 * AppTopbar.tsx is now the one implementation. Nothing here creates anything;
 * this bar is destinations only, which is what it always claimed to be.
 *
 * THE TEAM SIDE OF PITCHING HELD A TAB HERE FROM 2026-09-09 TO 2026-09-25.
 * "Playlist pitching should be accessible app wide on mobile on the nav bar at
 * the bottom" put /dashboard/pitching in this bar because, at the time, the
 * team side of pitching had no other mobile entry point — it existed only as
 * a release scene. The founder later reversed that: pitching belongs inside
 * each rollout's own menu, not the general bar, which is exactly where it
 * already lived as `'pitch'` (lib/release-menu.ts) the whole time this tab
 * also existed. Removing the tab therefore loses no reachability.
 *
 * Playlist pitches below is a different thing and stays: the CURATOR side,
 * /curator, the inbox for playlists this account owns — never scoped to a
 * release, so there is no rollout menu for it to fold into. It appears only
 * for a dual account (team + playlist owner) — a state currently held by a
 * single partner. This bar is the only navigation a phone has: the topbar's
 * own icons are `hidden lg:grid` under this flag and the identity card never
 * renders below `lg`, so without this tab a dual account has to open a second
 * tab to reach its own inbox. Its label is the fuller "Playlist pitches"
 * rather than the bare "Pitches", which both matches the side menu's wording
 * for the same destination and keeps a screen reader from hearing two
 * near-identical names in one bar.
 *
 * DIRECTORY HELD A TAB HERE FROM 2026-09-06 TO 2026-09-25. It was added
 * because it was "the ONE surface a phone could not reach at all" — the
 * identity card that carries it on desktop is `lg:block`, and the only other
 * path was the page search inside a scoped rollout's dock, so with no
 * rollout scoped there was no way in at all. Removed on the founder's own
 * later call ("remove directory too from the menu"), and UNLIKE Notes and
 * Pitching above, this one is not a free reshuffle: Directory is not
 * release-scoped, so there is no rollout menu to fold it into, and taking
 * its tab away reopens exactly the gap it was built to close — a phone can
 * still reach it via the identity card (desktop only) or a scoped rollout's
 * page search, nothing more. A deliberate trade the founder made, not one
 * this file should second-guess.
 *
 * LAYOUT. One row of equal `flex-1` slots, which is what it was before the
 * centred "+" arrived and what it is again now that the "+" has left.
 *
 * THE WIDTH BUDGET HAS MORE ROOM THAN EVER, now that Notes, the team side of
 * Pitching, and Directory are all gone (2026-09-25). At most four tabs
 * remain — Home, UrgAns, Shows, and Playlist pitches for a dual account —
 * which is 375 / 4 ≈ 94px a slot; a non-curator account sees three. The old
 * "three per side" ceiling, and the dual-account exclusion Directory carried
 * for one day back when it still had a tab here, were both artefacts of the
 * centred "+" this bar no longer has and are moot at this count regardless.
 *
 * WHICH SIDE a tab sat on used to be a width decision. It is now purely an
 * ORDERING one, left to right: Home, UrgAns, Shows, and Playlist pitches for
 * a dual account — working surfaces first, the crossing into the other side
 * of the product last.
 *
 * The ceiling for adding something NEW here is still about eight tabs at
 * 375px (~47px each); past that an overflow sheet is the honest answer rather
 * than another `flex-1`.
 *
 * The bar shows on every route AppShell mounts it on, /dashboard/urgans
 * included — hiding it there would leave the assistant page with no way out
 * except the topbar logo, since this bar is the only navigation on mobile. To
 * keep typing on that page (or any in-page form) from fighting the bar for the
 * keyboard's space, useKeyboardOpen hides it while the on-screen keyboard is
 * up — Android's `interactiveWidget: 'resizes-content'` shrinks the layout
 * viewport when the keyboard opens, and a `fixed bottom-0` bar would otherwise
 * ride up and sit on top of it.
 */
export function MobileNavBar() {
  const pathname = usePathname();
  const keyboardOpen = useKeyboardOpen();

  const isHome = pathname === '/dashboard';
  const isUrgAns = pathname === '/dashboard/urgans';
  const isShows = pathname?.startsWith('/dashboard/shows') ?? false;
  // Tri-state — `null` means the probe is still in flight, and it is null on
  // every fresh load (never persisted). Only a CONFIRMED positive adds the
  // Pitches tab, so while the answer is unknown the bar settles on the
  // non-curator shape, which is what almost every account resolves to. The one
  // dual account absorbs a single reflow the instant the probe answers.
  const hasCuratorProfile = useAuthStore((state) => state.hasCuratorProfile);

  // Home while a release is scoped means "leave this release", exactly like the
  // workspace back arrow — the founder asked for the two to match (2026-08-30:
  // "clicking home while in task view should lead them to catalog view, same
  // thing for that back button, always").
  //
  // The `<Link>` already does the leaving: `/dashboard` carries no query, so it
  // drops `?release=` and `?scene=` together and lands on the catalog. What was
  // missing is the other half of leaving — forgetting the scene the release was
  // showing, so tapping that release again starts at Activities rather than
  // resuming the scene the user just walked out of. WorkspaceView's goBack gets
  // this from setScope's `forgetScene`; there is no setScope here, so it goes
  // through the shared helper — which the side menu's Catalog row and the
  // topbar's Catalog icon also use, since all four are the same move made from
  // four different surfaces. Same end state, one rule.
  //
  // That helper reads `?release=` fresh at call time, deliberately: an answer
  // on demand, not a subscription that would drag the whole bar behind a
  // Suspense boundary (see the header).
  //
  // NO `if (!isHome) return` guard, and its removal is the fix for a real bug
  // (founder report, 2026-09-01: Home did not reach the catalog). The guard was
  // harmless for the scene half — there is no `?release=` to forget on
  // /settings, so the call self-no-ops — but the catalog INTENT has to be
  // recorded from every page, because the page it is recorded from is precisely
  // the page whose remount would otherwise auto-scope the user straight back
  // into their only release. See lib/catalog-intent.ts.
  const handleHomeClick = () => {
    leaveReleaseForCatalog();
  };

  const handleUrgAnsClick = () => {
    // Carry the drilled-in release as the assistant's scope, mirroring
    // ChappiTopbarAction's stacked (below-lg) branch — this bar only ever
    // renders below lg, so there is no rail-toggle branch to mirror too.
    // Reading location.search directly (rather than useSearchParams) keeps
    // this whole component Suspense-free.
    if (typeof window === 'undefined' || !isHome) return;
    const releaseId = new URLSearchParams(window.location.search).get('release');
    if (releaseId) {
      useChappiStore.getState().setScopedReleaseId(releaseId);
    }
  };

  return (
    <nav
      aria-label="Primary"
      className={`mobile-nav-bar fixed inset-x-0 bottom-0 z-30 border-t border-stroke-subtle bg-bg-base/88 backdrop-blur-xl lg:hidden ${
        keyboardOpen ? 'hidden' : ''
      }`}
    >
      <div className="flex h-16 w-full items-stretch">
        {/* ONE ROW OF EQUAL SLOTS (2026-09-06). It used to be two `flex-1`
            regions flanking a fixed 64px centre, which existed only to put the
            "+" on the bar's exact midpoint. That button moved to the topbar's
            top-right corner (founder call), so there is nothing to centre and
            nothing to flank: every tab is one `flex-1` slot again. */}
        <ul className="flex w-full items-stretch">
          <NavTab
            href="/dashboard"
            label="Home"
            dataTour="nav-catalog"
            Icon={CatalogIcon}
            isActive={isHome}
            onClick={handleHomeClick}
          />

          {CHAPPI_ENABLED ? (
            <NavTab
              href="/dashboard/urgans"
              label="UrgAns"
              dataTour="nav-urgans"
              Icon={ChappiIcon}
              isActive={isUrgAns}
              onClick={handleUrgAnsClick}
            />
          ) : null}

          {/* Shows — a plain destination, no search params. Prefix match,
              because a show's own page lives one level deeper and should keep
              this lit. */}
          {EVENTS_ENABLED ? (
            <NavTab
              href="/dashboard/shows"
              label="Shows"
              Icon={MicVocal}
              isActive={isShows}
            />
          ) : null}

          {/* The curator crossing LAST, and it is the other direction from the
              team side of pitching (now folded into each rollout's own menu,
              not a tab here): this is the inbox for playlists this account
              owns, not the pitches it sent. Dual accounts only. */}
          {PITCHING_ENABLED && hasCuratorProfile === true ? (
            <NavTab
              href="/curator"
              label="Playlist pitches"
              Icon={Inbox}
              isActive={pathname?.startsWith('/curator') ?? false}
            />
          ) : null}
        </ul>
      </div>
    </nav>
  );
}

// The keyboard signal moved to lib/keyboard-viewport.ts (2026-08-16): the
// assistant page's viewport-locked column needs the same answer, and the
// local hook this file used to carry only detected Android's
// `resizes-content` shrink — on iOS the layout viewport never moves, so the
// keyboard went undetected here. The shared module measures both.
