'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Inbox, MicVocal, Newspaper, Plus, Users } from '@/components/icons';
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
const PRESS_KITS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PRESS_KITS === 'true';
const DIRECTORY_ENABLED = process.env.NEXT_PUBLIC_FEATURE_DIRECTORY === 'true';

type MobileNavBarProps = {
  /** Opens the CreateReleaseModal AppShell owns — the same instance the
   * topbar's "New release" button and the ChappiDock's card use. */
  onNewRelease: () => void;
};

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

/**
 * Bottom tab bar, below lg only (NEXT_PUBLIC_FEATURE_MOBILE_NAV). Moves the
 * topbar's nav icons and the "New release" CTA down to where a thumb actually
 * reaches on a phone, and stands in for the ChappiDock launcher (which retires
 * on this same viewport range — see ChappiDock.tsx).
 *
 * Slots: Home (Catalog) · UrgAns · Notes · New release/New activity (centre,
 * filled) · Shows · Pitches · Press kits.
 *
 * EVERY TAB IS ALWAYS VISIBLE (founder call, 2026-09-05). Which tabs EXIST is
 * decided by feature flags and, for Pitches, by whether the account is a dual
 * team+curator one — all of which are fixed for a given account, so the bar
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
 * PRESS KITS IS LAST (founder call, 2026-09-05), taking the trailing slot Song
 * vacated. It is the outward-facing surface — the thing you send to somebody
 * — so it sits at the end rather than among the working tabs.
 *
 * ICONS ONLY — every tab's label is `sr-only` (founder call, 2026-08-31), to
 * save width. See tabClass above for why the strings are kept rather than
 * deleted.
 *
 * "You" is NOT here. It moved to the topbar's top-left corner on 2026-08-31
 * (founder call). That link is the only route to Settings on a phone; see
 * AppTopbar.
 *
 * The center button is contextual as of 2026-08-17: when a release is scoped
 * (`/dashboard?release=<id>`), it opens the task quick-create modal for that
 * release instead of "New release" — the same action TasksPanel's former
 * mobile "New activity" pill performed, which this button now supersedes on
 * mobile (that pill is gone; see TasksPanel.tsx's base-dock comment).
 * Everywhere else — catalog view, or any other route — it keeps opening "New
 * release" exactly as before. See `handleFabClick` below.
 *
 * Pitches appears only for a dual account (team + playlist owner) — a state
 * currently held by a single partner. It earns the crowding because this bar
 * is the only navigation a phone has: the topbar's own icons are
 * `hidden lg:grid` under this flag and the identity card never renders below
 * `lg`, so without it a dual account had to open a second tab to reach its own
 * inbox.
 *
 * LAYOUT, and it answers two separate questions — do not collapse them.
 *
 * Where the BUTTON sits: two `flex-1` regions flank a fixed-width centre, so
 * it lands on the bar's exact midpoint, `(W - 64) / 2 + 32`, on every view
 * whatever each side holds. This replaced a single row of equal slots, which
 * only centred it when the tabs happened to split evenly around it. It sat at
 * ~42% on the assistant page.
 *
 * WHICH SIDE a tab sits on is a WIDTH decision, not an ordering one. The two
 * regions are each `flex-1`, so they split the same width whatever they hold:
 * on a 375px phone with the 64px centre, each side is ~155px, which is ~52px
 * per tab at three and ~39px at four. Four is under the ~44px touch target, so
 * THREE PER SIDE IS THE CEILING — and the only account that can reach it on
 * both sides at once is a dual one (Shows · Pitches · Press kits). That is why
 * Notes sits on the left rather than trailing the FAB: on the right it would
 * make a fourth for exactly that account. A seventh tab needs a different
 * shape for this bar — an overflow sheet, not another `flex-1`.
 *
 * DIRECTORY (2026-09-06) is what made that ceiling bite. It takes the third
 * right-hand slot for every account EXCEPT a dual one, which already holds
 * three there. So the right side is Shows · Pitches · Press kits for a dual
 * account and Shows · Directory · Press kits for everybody else — three
 * either way, and never the four that would drop under the touch target. The
 * bar is now genuinely full: the next surface that wants a slot is the one
 * that has to build the overflow sheet.
 *
 * A region holding two tabs (the common, non-dual case on the right) spaces
 * them more airily than a region holding three. That is the honest cost of an
 * odd tab count around a centred button: five tabs cannot split evenly. Every
 * tab still clears the touch target, and the spacing is identical on every
 * view, so it reads as spacing rather than as something shifting.
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
export function MobileNavBar({ onNewRelease }: MobileNavBarProps) {
  const pathname = usePathname();
  const keyboardOpen = useKeyboardOpen();
  const { openQuickCreate } = useTaskUI();

  const isHome = pathname === '/dashboard';
  const isUrgAns = pathname === '/dashboard/urgans';
  const isNotes = pathname === '/dashboard/notes';
  const isShows = pathname?.startsWith('/dashboard/shows') ?? false;
  const isPressKits = pathname?.startsWith('/dashboard/press-kits') ?? false;
  // Exact, unlike Shows and Press kits: a person's page lives at /p/{slug},
  // not under this path, so there is no deeper route to keep lit.
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
            centred when the tabs happened to split evenly around it. On the
            assistant page it sat at ~42%. */}
        <ul className="flex flex-1 items-stretch">
          <NavTab
            href="/dashboard"
            label="Home"
            Icon={CatalogIcon}
            isActive={isHome}
            onClick={handleHomeClick}
          />

          {CHAPPI_ENABLED ? (
            <NavTab
              href="/dashboard/urgans"
              label="UrgAns"
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

        {/* RIGHT REGION. Three at most, and only a dual account reaches three. */}
        <ul className="flex flex-1 items-stretch">
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

          {PITCHING_ENABLED && hasCuratorProfile === true ? (
            <NavTab
              href="/curator"
              label="Pitches"
              Icon={Inbox}
              isActive={pathname?.startsWith('/curator') ?? false}
            />
          ) : null}

          {/* Directory (founder call, 2026-09-06). It is the ONE surface a
              phone could not reach at all: the identity card that carries it
              on desktop is `lg:block`, and the only other way in is the page
              search inside a scoped release's dock — so with no release
              scoped there was no path. The founder found it by accident,
              through the role gaps panel on a release.

              NOT SHOWN TO A DUAL ACCOUNT, and that is a width rule rather
              than a judgement about the feature. This side holds three at
              most (see the header), a dual account already fills it with
              Shows · Pitches · Press kits, and a fourth is ~39px — under the
              touch target. Presence here depends on ACCOUNT TYPE, which is
              fixed for a session, so nothing shifts under a thumb mid-use;
              that is the same rule Pitches itself follows and is different in
              kind from the URL-dependent tab that was removed.

              A dual account keeps the paths everyone had before this: the
              page search in a scoped release's dock, and the role gaps panel.
              Thin, and the reason the overflow sheet the header calls for is
              the real fix whenever a seventh tab is genuinely wanted. */}
          {DIRECTORY_ENABLED && !(PITCHING_ENABLED && hasCuratorProfile === true) ? (
            <NavTab
              href="/dashboard/directory"
              label="Directory"
              Icon={Users}
              isActive={isDirectory}
            />
          ) : null}

          {/* Press kits LAST (founder call, 2026-09-05), in the slot Song
              vacated: it is the surface you send outward rather than work in,
              so it belongs at the end of the bar rather than among the working
              tabs. Prefix match — a single kit's page lives one level deeper. */}
          {PRESS_KITS_ENABLED ? (
            <NavTab
              href="/dashboard/press-kits"
              label="Press kits"
              Icon={Newspaper}
              isActive={isPressKits}
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
