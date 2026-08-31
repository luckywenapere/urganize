'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CalendarDays, Inbox, Music, Plus } from 'lucide-react';
import { useKeyboardOpen } from '@/lib/keyboard-viewport';
import { useChappiStore } from '@/stores/useChappiStore';
import { useAuthStore } from '@/lib/auth-store';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { rememberScene } from '@/lib/scene-memory';
import { CatalogIcon, ChappiIcon, NotesIcon } from '@/components/app/BrandIcons';

// Same flags AppTopbar reads — a tab only exists in the bar when its surface
// exists at all.
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';
const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';
const EVENTS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EVENTS === 'true';
// Same flag that gates the `?scene=song` URL param, the Song pill in
// TasksPanel and the /song API routes — so this tab cannot offer a surface
// that does not exist.
const SONG_UPLOAD_ENABLED = process.env.NEXT_PUBLIC_FEATURE_SONG_UPLOAD === 'true';

type MobileNavBarProps = {
  /** Opens the CreateReleaseModal AppShell owns — the same instance the
   * topbar's "New release" button and the ChappiDock's card use. */
  onNewRelease: () => void;
};

/** The Song tab's whole SLOT, `<li>` included. Shared so the Suspense fallback
 *  below and the resolved tab cannot drift apart in size, spacing or colour —
 *  the `ArtistLine` split in WorkspaceIdentityPanel, for the same reason.
 *
 *  The `<li>` lives in HERE rather than in the bar, and that is what makes a
 *  hidden tab actually disappear: a `flex-1` list item left standing around a
 *  component that returned null still claims its share of the row, so the bar
 *  kept a blank gap where Home or Song used to be and pushed the centre button
 *  off the midpoint. Returning null from the whole slot removes the space too. */
function SongTabLink({ href, isActive }: { href: string; isActive: boolean }) {
  return (
    <li className="flex-1">
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
          isActive ? 'text-brand' : 'text-content-tertiary hover:text-content-secondary'
        }`}
      >
        <Music className="h-5 w-5" />
        Song
      </Link>
    </li>
  );
}

/** Home's markup. Same split as Song's, for the same reason: the Suspense
 *  fallback and the resolved tab must stay pixel-identical. */
function HomeTabLink({ isActive, onClick }: { isActive: boolean; onClick: () => void }) {
  return (
    <li className="flex-1">
      <Link
        href="/dashboard"
        onClick={onClick}
        aria-current={isActive ? 'page' : undefined}
        className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
          isActive ? 'text-brand' : 'text-content-tertiary hover:text-content-secondary'
        }`}
      >
        <CatalogIcon className="h-5 w-5" />
        Home
      </Link>
    </li>
  );
}

/**
 * Hidden on the bare catalog — `/dashboard` with no `?release=` — because
 * that is where the tap would land you already (founder call, 2026-08-30).
 * Shown everywhere else, a scoped `/dashboard?release=<id>` included, so
 * leaving a scoped release still has its own way back to the catalog.
 *
 * ISOLATED BEHIND ITS OWN SUSPENSE BOUNDARY for the reason SongTab's own
 * header gives below: `useSearchParams` in a statically prerendered client
 * component pulls the nearest boundary down with it, and this bar is mounted
 * on `/settings` too, which must stay `○ Static`.
 */
function HomeTab({ isHome, onClick }: { isHome: boolean; onClick: () => void }) {
  const searchParams = useSearchParams();
  if (isHome && !searchParams.get('release')) return null;
  return <HomeTabLink isActive={isHome} onClick={onClick} />;
}

/**
 * Song is a release SCENE, not a global page, so this tab is the one entry in
 * the bar whose destination depends on the URL: `?release=<id>&scene=song`
 * when a release is scoped, the catalog otherwise (which is where you pick
 * one) — EXCEPT on the bare catalog itself, where that fallback link would
 * just point back at the screen already on-screen, so it hides there too
 * (the same bare-home rule as Home, above). Everywhere else it is rendered
 * unconditionally rather than appearing only while scoped — a tab that comes
 * and goes would reflow the whole bar on every scope change, the same
 * layout-shift the Pitches tab's tri-state read is written to avoid.
 *
 * ISOLATED BEHIND ITS OWN SUSPENSE BOUNDARY, and that is not stylistic:
 * `useSearchParams` in a statically prerendered client component makes Next
 * bail out to the nearest boundary, and this bar is mounted app-wide by
 * AppShell — including on `/settings`, which must stay `○ Static`. Contained
 * here, only this one tab waits. Do not lift the hook into the bar itself.
 * (This is also why the two click handlers below read `window.location.search`
 * at click time instead: they need an answer once, on demand, not a
 * subscription.)
 */
function SongTab({ isHome, isSettings }: { isHome: boolean; isSettings: boolean }) {
  const searchParams = useSearchParams();
  const releaseId = searchParams.get('release');

  // Settings is the ACCOUNT surface, and Song is a release scene — so it has
  // no business here (founder call, 2026-08-30). It would only ever render as
  // the pick-a-release fallback below, pointing at the catalog, which is a tab
  // that leaves the page you are on to go and choose something else. You is
  // the tab that belongs on this view, and it is the one that lights up.
  if (isSettings) return null;

  if (!releaseId) {
    if (isHome) return null;
    return <SongTabLink href="/dashboard" isActive={false} />;
  }

  // Already on the workspace: keep its params, so opening Song does not throw
  // away the calendar's remembered tab and month (SCENE_SCOPED_PARAMS, which
  // deliberately survive a scene closing). From anywhere else — the notes page
  // carries `?release=` too — build a clean URL rather than dragging that
  // page's own params across.
  const params = isHome ? new URLSearchParams(searchParams.toString()) : new URLSearchParams();
  params.set('release', releaseId);
  params.set('scene', 'song');

  return (
    <SongTabLink
      href={`/dashboard?${params.toString()}`}
      isActive={isHome && searchParams.get('scene') === 'song'}
    />
  );
}

/**
 * Bottom tab bar, below lg only (NEXT_PUBLIC_FEATURE_MOBILE_NAV). Moves the
 * topbar's nav icons and the "New release" CTA down to where a thumb
 * actually reaches on a phone, and stands in for the ChappiDock launcher
 * (which retires on this same viewport range — see ChappiDock.tsx).
 *
 * Slots: Home (Catalog) · UrgAns · New release/New activity (centre, filled) ·
 * Notes · Shows · Song. Song trails the bar rather than sitting beside the "+"
 * — see its own comment below for why the one tab that comes and goes belongs
 * last.
 *
 * "You" is NOT here. It moved to the topbar's top-left corner on 2026-08-31
 * (founder call) so this bar reads as four tabs around a centred button. That
 * link is the only route to Settings on a phone; see AppTopbar.
 *
 * The center button is contextual as of 2026-08-17: when a release is
 * scoped (`/dashboard?release=<id>`), it opens the task quick-create modal
 * for that release instead of "New release" — the same action TasksPanel's
 * former mobile "New activity" pill performed, which this button now
 * supersedes on mobile (that pill is gone; see TasksPanel.tsx's base-dock
 * comment). Everywhere else — catalog view, or any other route — it keeps
 * opening "New release" exactly as before. See `handleFabClick` below.
 *
 * Pitches appears only for a dual account (team + playlist owner) — a state
 * currently held by a single partner. It earns the crowding because this bar
 * is the only navigation a phone has: the topbar's own icons are
 * `hidden lg:grid` under this flag and the identity card never renders below
 * `lg`, so without it a dual account had to open a second tab to reach its own
 * inbox.
 *
 * Home and Song both drop out on the bare catalog (`/dashboard` with no
 * `?release=`) — see HomeTab's and SongTab's own headers for why. So the bar
 * is shorter by two on the one screen it opens on, and fills back in the
 * moment a release is scoped or another page is reached.
 *
 * `/settings` drops Song as well (founder call, 2026-08-30): it is the ACCOUNT
 * surface, so the release-scene tab has no business on it, and there it could
 * only ever be the pick-a-release fallback pointing back at the catalog.
 *
 * So, per view: the catalog is UrgAns · + · Shows; a scoped release, the
 * assistant, Notes and Shows are Home · UrgAns · + · Shows · Song; `/settings`
 * is Home · UrgAns · + · Shows.
 *
 * LAYOUT. Two `flex-1` regions flank a fixed-width centre, so the "+" sits on
 * the bar's exact midpoint on every one of those views. That is deliberate and
 * replaced a single row of equal `flex-1` slots, which only centred the button
 * when the tabs happened to split evenly around it — and they never reliably
 * do, since Home, Song and Pitches each come and go on their own rule. Two
 * things go wrong if this is flattened back: the button drifts (it sat at ~42%
 * on the assistant page), and a hidden tab leaves a blank gap, because a
 * `flex-1` `<li>` wrapped around a component that returned null still claims
 * its share. Each tab therefore renders its OWN `<li>`, or nothing at all.
 *
 * WIDTH. Within a region the tabs split it evenly. Song and Pitches are
 * mutually exclusive (a dual account gets Pitches and not Song), so the
 * ceiling is FIVE tabs plus the button: Home, UrgAns, Notes, Shows, and
 * whichever of Song/Pitches applies. With the 64px centre, a 375px phone gives
 * each side ~155px, so a three-tab region is ~52px against a widest label of
 * "Pitches" at ~45px. That is the hard ceiling. A SIXTH TAB NEEDS A DIFFERENT
 * SHAPE — an overflow sheet holding the optional global surfaces — not another
 * `flex-1`.
 *
 * The bar shows on every route AppShell mounts it on, /dashboard/urgans
 * included — hiding it there would leave the assistant page with no way out
 * except the topbar logo, since this bar just became the only navigation on
 * mobile. To keep typing on that page (or any in-page form) from fighting the
 * bar for the keyboard's space, useKeyboardOpen hides it while the on-screen
 * keyboard is up — Android's `interactiveWidget: 'resizes-content'` shrinks
 * the layout viewport when the keyboard opens, and a `fixed bottom-0` bar
 * would otherwise ride up and sit on top of it.
 */
export function MobileNavBar({ onNewRelease }: MobileNavBarProps) {
  const pathname = usePathname();
  const keyboardOpen = useKeyboardOpen();
  const { openQuickCreate } = useTaskUI();

  const isHome = pathname === '/dashboard';
  const isUrgAns = pathname === '/dashboard/urgans';
  const isNotes = pathname === '/dashboard/notes';
  const isShows = pathname?.startsWith('/dashboard/shows') ?? false;
  const isSettings = pathname?.startsWith('/settings') ?? false;
  // Tri-state — `null` means the probe is still in flight, and it is null on
  // every fresh load (never persisted). TWO tabs read it, in opposite
  // directions but on the same rule: only a CONFIRMED positive changes the
  // bar. Pitches waits for `=== true` to appear; Song hides on `=== true` and
  // shows otherwise. So while the answer is unknown both settle on the
  // non-curator shape, which is what almost every account resolves to — the
  // common case never shifts mid-load, and the one dual account absorbs a
  // single reflow at the same instant Pitches arrives anyway.
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
  // this from setScope's `forgetScene`; there is no setScope here, so it calls
  // rememberScene directly. Same end state, one rule.
  //
  // Reads `?release=` fresh at click time for the reason SongTab's header
  // gives: an answer on demand, not a subscription that would drag the whole
  // bar behind a Suspense boundary.
  const handleHomeClick = () => {
    if (typeof window === 'undefined' || !isHome) return;
    const releaseId = new URLSearchParams(window.location.search).get('release');
    if (releaseId) rememberScene(releaseId, null);
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

  // Center "+" button (2026-08-17): "New activity" when a release is scoped,
  // "New release" everywhere else. Reads `?release=` fresh at click time —
  // the same deliberate `handleUrgAnsClick` pattern above, and for the same
  // reason: staying Suspense-free by not subscribing via `useSearchParams()`.
  // This also guarantees the ACTION is always correct regardless of whether
  // this component re-rendered since the URL last changed (scoping a release
  // via `router.replace` on the same `/dashboard` pathname doesn't itself
  // trigger a re-render here) — unlike a label, a wrong button action would
  // be a real bug, so it can't be allowed to go stale. The aria-label/title
  // stay "New release" rather than trying to mirror this dynamically for the
  // same reason: a render-time read of the same URL could lag on exactly
  // that transition, and a label that's sometimes wrong is worse than one
  // that's honestly generic.
  const handleFabClick = () => {
    if (typeof window !== 'undefined' && isHome) {
      const releaseId = new URLSearchParams(window.location.search).get('release');
      if (releaseId) {
        openQuickCreate({ releaseId, source: 'inline' });
        return;
      }
    }
    onNewRelease();
  };

  return (
    <nav
      aria-label="Primary"
      className={`mobile-nav-bar fixed inset-x-0 bottom-0 z-30 border-t border-stroke-subtle bg-bg-base/88 backdrop-blur-xl lg:hidden ${
        keyboardOpen ? 'hidden' : ''
      }`}
    >
      <div className="flex h-16 w-full items-stretch">
        {/* LEFT REGION. `flex-1`, and its twin on the right is too, so the
            fixed-width centre between them lands on the bar's exact midpoint
            whatever each side happens to hold. That is what makes the centring
            structural instead of an accident of counting: before this, every
            tab was one `flex-1` slot in a single row, so the button was only
            centred when the tabs happened to split evenly around it — and they
            do not, since Home, Song and Pitches each come and go on their own
            rule. On the assistant page it sat at ~42%. */}
        <ul className="flex flex-1 items-stretch">
          <Suspense fallback={<HomeTabLink isActive={isHome} onClick={handleHomeClick} />}>
            <HomeTab isHome={isHome} onClick={handleHomeClick} />
          </Suspense>

          {CHAPPI_ENABLED ? (
            <li className="flex-1">
              <Link
                href="/dashboard/urgans"
                onClick={handleUrgAnsClick}
                aria-current={isUrgAns ? 'page' : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                  isUrgAns ? 'text-brand' : 'text-content-tertiary hover:text-content-secondary'
                }`}
              >
                <ChappiIcon className="h-5 w-5" />
                UrgAns
              </Link>
            </li>
          ) : null}
        </ul>

        {/* CENTRE. Deliberately outside both lists: it is an ACTION, not a
            destination, so it never belonged among a list of nav links. Fixed
            width is what the two regions measure against. */}
        <div className="flex w-16 shrink-0 items-center justify-center">
          <button
            type="button"
            onClick={handleFabClick}
            aria-label="New release"
            title="New release"
            className="motion-focus motion-press grid h-12 w-12 place-items-center rounded-full border border-brand/25 bg-brand text-content-inverse shadow-[0_18px_36px_-28px_rgb(var(--color-brand)/0.55)] hover:bg-brand-hover"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {/* RIGHT REGION. */}
        <ul className="flex flex-1 items-stretch">

        {NOTES_ENABLED ? (
          <li className="flex-1">
            <Link
              href="/dashboard/notes"
              aria-current={isNotes ? 'page' : undefined}
              className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                isNotes ? 'text-brand' : 'text-content-tertiary hover:text-content-secondary'
              }`}
            >
              <NotesIcon className="h-5 w-5" />
              Notes
            </Link>
          </li>
        ) : null}

        {/* Shows — the other global surface, beside Notes and for the same
            reason: a plain destination, no search params, so no Suspense
            boundary. Prefix match, because a show's own page lives one level
            deeper and should keep this lit.

            It is the SEVENTH slot in the worst case, which is the ceiling this
            bar's own width note names: Song and Pitches are mutually exclusive,
            so no account ever gets both, and 375 / 7 = ~53px against a widest
            label of "Pitches" at ~45px. That was already measured clear. An
            EIGHTH would need a different shape for this bar — an overflow
            sheet, not another `flex-1` — so this is the last tab that fits. */}
        {EVENTS_ENABLED ? (
          <li className="flex-1">
            <Link
              href="/dashboard/shows"
              aria-current={isShows ? 'page' : undefined}
              className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                isShows ? 'text-brand' : 'text-content-tertiary hover:text-content-secondary'
              }`}
            >
              <CalendarDays className="h-5 w-5" />
              Shows
            </Link>
          </li>
        ) : null}

        {PITCHING_ENABLED && hasCuratorProfile === true ? (
          <li className="flex-1">
            <Link
              href="/curator"
              aria-current={pathname?.startsWith('/curator') ? 'page' : undefined}
              className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                pathname?.startsWith('/curator')
                  ? 'text-brand'
                  : 'text-content-tertiary hover:text-content-secondary'
              }`}
            >
              <Inbox className="h-5 w-5" />
              Pitches
            </Link>
          </li>
        ) : null}

        {/* Song is LAST (founder call, 2026-08-30 — superseding the same day's
            "immediately after the +"). It is the only tab that comes and goes
            with the scoped release, so trailing the bar means appearing and
            disappearing shifts nothing: the tabs before it hold their positions
            and Song is simply added to or removed from the end. In its former
            slot it pushed its neighbours sideways every time a release was
            opened or left.

            A DUAL ACCOUNT (team + playlist owner) never gets this tab at all
            (founder call, 2026-08-30). That account is the only one carrying
            Pitches, so it is the only one that would run seven slots, and it is
            also the account least likely to be uploading masters from a phone.
            Losing it here costs that account nothing: Song is still one tap
            away in the folded "more" menu, which is exactly why that duplicate
            is kept rather than tidied away.

            It STAYS in the folded "more" menu for every account, deliberately:
            this bar is gated on NEXT_PUBLIC_FEATURE_MOBILE_NAV while the menu
            is not, so removing it there would tie Song's mobile reachability to
            a second flag and leave a band with no entry point at all — the
            exact compounding failure recorded under "Crossing between the two
            portals". */}
        {/* The `!isSettings` gate is out here, not just inside SongTab, so the
            Suspense fallback cannot flash the tab in and straight back out on a
            view it never belongs on. SongTab bails on it too — the gate that
            matters is the one nearest the decision. */}
        {SONG_UPLOAD_ENABLED && hasCuratorProfile !== true && !isSettings ? (
          <Suspense fallback={<SongTabLink href="/dashboard" isActive={false} />}>
            <SongTab isHome={isHome} isSettings={isSettings} />
          </Suspense>
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
