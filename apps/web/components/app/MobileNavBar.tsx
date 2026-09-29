'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home as HomeIcon, Inbox, MicVocal, Radio, Users } from '@/components/icons';
import { useKeyboardOpen } from '@/lib/keyboard-viewport';
import { useChappiStore } from '@/stores/useChappiStore';
import { useAuthStore } from '@/lib/auth-store';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { CatalogIcon, ChappiIcon, NotesIcon } from '@/components/app/BrandIcons';

// Same flags AppTopbar reads — a tab only exists in the bar when its surface
// exists at all.
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';
const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';
const EVENTS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EVENTS === 'true';
const DIRECTORY_ENABLED = process.env.NEXT_PUBLIC_FEATURE_DIRECTORY === 'true';
const HOME_ENABLED = process.env.NEXT_PUBLIC_FEATURE_HOME === 'true';

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
 * Slots: Home · Catalog · UrgAns · Notes · Shows · Pitching · Directory, plus
 * Playlist pitches for a dual account.
 *
 * HOME (NEXT_PUBLIC_FEATURE_HOME) LEADS THE BAR. Until this flag, "Home" was
 * this bar's own name for the catalog tab, below — the plain lucide house
 * mark, since a hand-drawn house glyph is a separate design decision this
 * flag doesn't make. The catalog tab is renamed Catalog here (its
 * `dataTour="nav-catalog"` and its behaviour are unchanged) so the two never
 * share a label. Flag off, this tab renders nowhere and the bar is exactly
 * what it was.
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
 * surface; it is now reached from Settings alone, and Pitching took the slot.
 * The pages did not move, so a link to one still resolves.
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
 * PITCHING IS FOR EVERY TEAM ACCOUNT (founder call, 2026-09-09): "Playlist
 * pitching should be accessible app wide on mobile on the nav bar at the
 * bottom." Until now the team side of pitching existed only as a release
 * scene, so it could not be reached at all without first scoping a release —
 * and the only pitching entry in this bar belonged to the dual-account
 * crossing below, which is the OTHER direction (pitches you received).
 *
 * The two are separate tabs on purpose and must stay distinguishable. This one
 * is the team side: /dashboard/pitching, every pitch you sent. Playlist
 * pitches below is the curator side: /curator, the inbox for playlists you
 * own. Labels are `sr-only` here, so the visible difference is the glyph —
 * Radio (the same one the release Pitch pill uses) against Inbox.
 *
 * Playlist pitches appears only for a dual account (team + playlist owner) — a
 * state currently held by a single partner. This bar is the only navigation a
 * phone has: the topbar's own icons are `hidden lg:grid` under this flag and
 * the identity card never renders below `lg`, so without it a dual account had
 * to open a second tab to reach its own inbox. Its label is the fuller
 * "Playlist pitches" rather than the bare "Pitches" it read until 2026-09-09,
 * which both matches the side menu's wording for the same destination and
 * keeps a screen reader from hearing two near-identical names in one bar.
 *
 * LAYOUT. One row of equal `flex-1` slots, which is what it was before the
 * centred "+" arrived and what it is again now that the "+" has left.
 *
 * THE WIDTH BUDGET IS MUCH LOOSER THAN IT WAS, and the arithmetic is the
 * reason two rules above it were deleted rather than adjusted. With the 64px
 * centre gone the whole 375px is divisible: six tabs are ~62px each and seven
 * — the dual-account maximum — are ~54px, both comfortably over the ~44px
 * touch target. The old "three per side" ceiling, and the dual-account
 * exclusion Directory carried for one day because of it, were both artefacts
 * of that fixed centre and are gone with it. The 2026-09-09 swap held the
 * count flat: Pitching arrived in the slot Press kits left.
 *
 * WHICH SIDE a tab sat on used to be a width decision. It is now an ORDERING
 * one, and the order is left to right: Home, UrgAns, Notes, Shows, Pitching,
 * Directory, and Playlist pitches for a dual account — working surfaces
 * first, the crossing into the other side of the product last. Notes no
 * longer sits where it does for a width reason; it sits there because that is
 * where it reads.
 *
 * The ceiling now is about eight tabs at 375px (~47px each), so there is real
 * headroom, but an overflow sheet is still the honest answer past that rather
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

  // Renamed from isHome now that a real Home route exists — this is still
  // exactly "is the catalog at rest", unchanged in meaning, just no longer
  // sharing a name with the new tab below.
  const isCatalog = pathname === '/dashboard';
  const isDashboardHome = pathname === '/dashboard/home';
  const isUrgAns = pathname === '/dashboard/urgans';
  const isNotes = pathname === '/dashboard/notes';
  const isShows = pathname?.startsWith('/dashboard/shows') ?? false;
  const isPitching = pathname?.startsWith('/dashboard/pitching') ?? false;
  // Exact, unlike Shows: a person's page lives at /p/{slug}, not under this
  // path, so there is no deeper route to keep lit.
  const isDirectory = pathname === '/dashboard/directory';
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
  const handleCatalogClick = () => {
    leaveReleaseForCatalog();
  };

  const handleUrgAnsClick = () => {
    // Carry the drilled-in release as the assistant's scope, mirroring
    // ChappiTopbarAction's stacked (below-lg) branch — this bar only ever
    // renders below lg, so there is no rail-toggle branch to mirror too.
    // Reading location.search directly (rather than useSearchParams) keeps
    // this whole component Suspense-free.
    if (typeof window === 'undefined' || !isCatalog) return;
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
          {HOME_ENABLED ? (
            <NavTab
              href="/dashboard/home"
              label="Home"
              dataTour="nav-home"
              Icon={HomeIcon}
              isActive={isDashboardHome}
            />
          ) : null}

          <NavTab
            href="/dashboard"
            label="Catalog"
            dataTour="nav-catalog"
            Icon={CatalogIcon}
            isActive={isCatalog}
            onClick={handleCatalogClick}
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

          {/* Notes is on THIS side for a width reason, not an ordering one —
              see the header. On the right it would be a fourth tab for a dual
              account (Notes · Shows · Pitches · Press kits), which is ~39px
              each and under the touch target. */}
          {NOTES_ENABLED ? (
            <NavTab
              href="/dashboard/notes"
              label="Notes"
              Icon={NotesIcon}
              isActive={isNotes}
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

          {/* Pitching — the TEAM side, in the slot Press kits left. Every team
              account, not just a dual one: until 2026-09-09 the only way to
              reach the team side of pitching was to scope a release first. */}
          {PITCHING_ENABLED ? (
            <NavTab
              href="/dashboard/pitching"
              label="Pitching"
              Icon={Radio}
              isActive={isPitching}
            />
          ) : null}

          {/* Directory (founder call, 2026-09-06). It is the ONE surface a
              phone could not reach at all: the identity card that carries it
              on desktop is `lg:block`, and the only other way in is the page
              search inside a scoped release's dock — so with no release
              scoped there was no path. The founder found it by accident,
              through the role gaps panel on a release.

              It was withheld from a DUAL account for one day (2026-09-06),
              because the right-hand region held three at most and a dual
              account already filled it. That constraint came from the centred
              "+", which the founder moved to the topbar hours later — with
              the bar a single row, seven tabs are ~54px each at 375px, over
              the touch target, so the exclusion had no reason left and is
              gone. Everybody sees this tab now. */}
          {DIRECTORY_ENABLED ? (
            <NavTab
              href="/dashboard/directory"
              label="Directory"
              Icon={Users}
              isActive={isDirectory}
            />
          ) : null}

          {/* The curator crossing LAST, and it is the other direction from
              Pitching above: this is the inbox for playlists this account
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
