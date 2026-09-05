'use client';

import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Inbox, MicVocal, Music, Plus } from '@/components/icons';
import { useKeyboardOpen } from '@/lib/keyboard-viewport';
import { useChappiStore } from '@/stores/useChappiStore';
import { useAuthStore } from '@/lib/auth-store';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
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

/**
 * A hidden tab's RESERVED space (founder call, 2026-08-31).
 *
 * Home and Song each drop out on their own view, and without this the tabs
 * beside them slide across to fill the gap — so UrgAns and Shows sat in one
 * place on the catalog and another on a scoped release, and jumped every time
 * you moved between the two. Holding the slot open keeps every tab at a fixed
 * x position across every view, which is what makes the bar feel still.
 *
 * So a "hidden" tab here means invisible, not absent. `aria-hidden` plus no
 * children keeps it out of the accessibility tree, so screen readers and
 * keyboard focus skip it exactly as if it were not rendered.
 */
function EmptyTabSlot() {
  return <li className="flex-1" aria-hidden />;
}

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
 * Dropping the labels also retires the width ceiling this bar was measured
 * against: that ceiling was set by the widest LABEL ("Pitches", ~45px), and a
 * 20px glyph in a ~52px slot has room to spare. The seven-slot limit recorded
 * below is now a touch-target question, not a text one.
 */
function tabClass(isActive: boolean): string {
  return `flex h-full w-full flex-col items-center justify-center transition-colors ${
    isActive ? 'text-brand' : 'text-content-tertiary hover:text-content-secondary'
  }`;
}

/** Icon components come from two families — hand-drawn BrandIcons return
 *  ReactElement, lucide-react types its own as ReactElement | null — so this
 *  is deliberately widened to ReactNode rather than making every lucide icon
 *  need a wrapper (the `MetadataIcon` problem, recorded in CLAUDE.md). */
type TabIcon = (props: { className?: string }) => ReactNode;

/** A plain destination tab: `<li>` included, so a tab and an EmptyTabSlot are
 *  interchangeable at the same position in the list. */
function NavTab({
  href,
  label,
  Icon,
  isActive,
  onClick,
}: {
  href: string;
  label: string;
  Icon: TabIcon;
  isActive: boolean;
  onClick?: () => void;
}) {
  return (
    <li className="flex-1">
      <Link
        href={href}
        onClick={onClick}
        aria-current={isActive ? 'page' : undefined}
        className={tabClass(isActive)}
      >
        <Icon className="h-5 w-5" />
        <span className="sr-only">{label}</span>
      </Link>
    </li>
  );
}

/** The Song tab's whole SLOT, `<li>` included. Shared so the Suspense fallback
 *  below and the resolved tab cannot drift apart in size, spacing or colour —
 *  the `ArtistLine` split in WorkspaceIdentityPanel, for the same reason. The
 *  `<li>` lives in here rather than in the bar so a tab and its placeholder
 *  are interchangeable at the same position in the list. */
function SongTabLink({ href, isActive }: { href: string; isActive: boolean }) {
  return <NavTab href={href} label="Song" Icon={Music} isActive={isActive} />;
}

/** Home's markup. Same split as Song's, for the same reason: the Suspense
 *  fallback and the resolved tab must stay pixel-identical. */
function HomeTabLink({ isActive, onClick }: { isActive: boolean; onClick: () => void }) {
  return (
    <NavTab
      href="/dashboard"
      label="Home"
      Icon={CatalogIcon}
      isActive={isActive}
      onClick={onClick}
    />
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
  if (isHome && !searchParams.get('release')) return <EmptyTabSlot />;
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
  if (isSettings) return <EmptyTabSlot />;

  if (!releaseId) {
    if (isHome) return <EmptyTabSlot />;
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
 * because it is the one tab that comes and goes with the scoped release. (A
 * Notifications tab briefly shared that slot on 2026-08-31 and was reverted
 * the same day — see the trailing slot's own comment for the mechanism.)
 *
 * ICONS ONLY — every tab's label is `sr-only` (founder call, 2026-08-31), to
 * save width. See tabClass above for why the strings are kept rather than
 * deleted, and for what that does to the width ceiling below.
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
 * So, per view — with `·` marking a slot held open rather than closed up:
 * the catalog is · UrgAns · + · Notes · Shows ·; a scoped release, Notes and
 * Shows are Home · UrgAns · + · Notes · Shows · Song; `/settings` is
 * Home · UrgAns · + · Notes · Shows ·.
 *
 * LAYOUT, and it answers two separate questions — do not collapse them.
 *
 * Where the BUTTON sits: two `flex-1` regions flank a fixed-width centre, so
 * it lands on the bar's exact midpoint, `(W - 64) / 2 + 32`, on every view
 * whatever each side holds. This replaced a single row of equal slots, which
 * only centred it when the tabs happened to split evenly around it — and they
 * never reliably do, since Home, Song and Pitches each come and go on their
 * own rule. It sat at ~42% on the assistant page.
 *
 * Where the TABS sit: a tab that hides keeps its slot (EmptyTabSlot), so every
 * tab holds one x position across every view. Letting the row close up instead
 * meant UrgAns and Shows slid inward on the catalog and jumped back out on a
 * scoped release — the bar rearranging itself under a thumb that is already
 * moving toward a target. Reserving the space costs a little width on the
 * catalog and buys stillness everywhere, which is the trade the founder chose.
 *
 * WIDTH. Within a region the tabs split it evenly, and because a hidden tab
 * still holds its slot, that split is the SAME on every view for a given
 * account — so the measurement below is the worst case and the only case.
 * Song and Pitches are mutually exclusive (a dual account gets Pitches and
 * not Song), so the ceiling is FIVE tabs plus the button: Home, UrgAns, Notes,
 * Shows, and whichever of Song/Pitches applies. With the 64px centre, a 375px phone gives each
 * side ~155px, so a three-tab region is ~52px per tab.
 *
 * Since 2026-08-31 that number is measured against a 20px GLYPH rather than a
 * ~45px label, so the constraint is now the touch target (~44px recommended)
 * and not the text. There is real headroom that there was not before. A sixth
 * tab is still a deliberate decision rather than a free one — at ~44px a
 * four-tab region is at the edge — but it is no longer the hard stop it was,
 * and the overflow sheet is the shape to reach for beyond that.
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
  // this from setScope's `forgetScene`; there is no setScope here, so it goes
  // through the shared helper — which the side menu's Catalog row and the
  // topbar's Catalog icon also use, since all four are the same move made from
  // four different surfaces. Same end state, one rule.
  //
  // That helper reads `?release=` fresh at call time for the reason SongTab's
  // header gives: an answer on demand, not a subscription that would drag the
  // whole bar behind a Suspense boundary.
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
            <NavTab
              href="/dashboard/urgans"
              label="UrgAns"
              Icon={ChappiIcon}
              isActive={isUrgAns}
              onClick={handleUrgAnsClick}
            />
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
          <NavTab
            href="/dashboard/notes"
            label="Notes"
            Icon={NotesIcon}
            isActive={isNotes}
          />
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
          <NavTab
            href="/dashboard/shows"
            label="Shows"
            Icon={MicVocal}
            isActive={isShows}
          />
        ) : null}

        {PITCHING_ENABLED && hasCuratorProfile === true ? (
          <NavTab
            href="/curator"
            label="Pitches"
            Icon={Inbox}
            isActive={pathname?.startsWith('/curator') ?? false}
          />
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
        {/* The flag and the dual-account rule decide whether this slot EXISTS
            at all; those are fixed per account, so dropping it entirely costs
            no stability. Which view you are on decides only whether it is
            VISIBLE, and that is SongTab's business — it reserves the space
            instead (see EmptyTabSlot). The Settings fallback matches, so the
            tab cannot flash in and straight back out on a view it never
            belongs on. */}
        {/* THE TRAILING SLOT — Song, as it was before 2026-08-31.

            A Notifications tab briefly lived here on the assistant page, and it
            is REVERTED (2026-08-31) because it broke that page on mobile.

            THE MECHANISM, so nobody re-lands it the same way: the topbar's own
            bell is wrapped in `hidden lg:block`, which is CSS — the component
            still MOUNTS below `lg` and still runs its effects. Adding a second
            instance here therefore gave the assistant page TWO live bells, each
            calling `supabase.channel(\`notifications:${'${userId}'}\`)` on the same
            topic and each fetching /api/notifications. Duplicate realtime
            subscriptions to one topic are not something supabase-js promises
            anything sane about, and with no error boundaries anywhere in this
            app (see CLAUDE.md's Known issues) a throw in that effect takes the
            page down rather than surfacing.

            Re-landing it needs ONE live subscription, not two — hoist the
            notifications fetch + channel into a shared store so any number of
            triggers can render against it. Do not simply gate the second
            instance on a viewport check: that leaves two independent fetches
            and two toasts for one event the moment both are ever visible. */}
        {SONG_UPLOAD_ENABLED && hasCuratorProfile !== true ? (
          <Suspense
            fallback={
              isSettings ? <EmptyTabSlot /> : <SongTabLink href="/dashboard" isActive={false} />
            }
          >
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
