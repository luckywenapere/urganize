'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Inbox, Plus } from '@/components/icons';
import { Logo } from '@urganize/ui';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useChappiStore } from '@/stores/useChappiStore';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { WorkspaceMenu } from '@/components/app/WorkspaceMenu';
import { NotificationsBell } from '@/components/app/NotificationsBell';
import { HelpMenu } from '@/components/app/HelpMenu';
import { CatalogIcon, ChappiIcon, ProfileIcon } from '@/components/app/BrandIcons';
import { useAuthStore } from '@/lib/auth-store';
import { settingsDeepLink } from '@/lib/settings-nav';
import { useSettingsLinkClick } from '@/components/settings/useOpenSettings';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';

// Same flag ChappiPageClient reads. Inlined at build time (NEXT_PUBLIC_
// prefix) so the icon only appears once Chappi's own dedicated page is
// reachable.
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

// The crossing point into the playlist-owner side, for an account that holds
// BOTH capabilities. Gated on the flag AND on the account actually owning a
// curator profile, so a normal team never sees it. The identity card carries
// the same link at `lg`+, but that card is `hidden lg:block` and hides again at
// `lg`-`xl` while the UrgAns rail is open — so without this control (and the
// MobileNavBar tab beside it) a dual account on a phone had NO way across and
// had to open a second tab.
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';

// When on, MobileNavBar (mounted by AppShell) carries these controls below
// lg instead — the topbar hides its own copies there rather than showing
// both. NAV_ICON_DISPLAY replaces the bare `grid` these controls' root
// classNames used to open with; flag off, the string is byte-identical to
// before.
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';
const NAV_ICON_DISPLAY = MOBILE_NAV_ENABLED ? 'hidden lg:grid' : 'grid';

// Home tab. The logo's "go home" affordance points at /dashboard/home when
// this is on, and /dashboard (the catalog) when it's off — byte-identical to
// before the flag existed.
const HOME_ENABLED = process.env.NEXT_PUBLIC_FEATURE_HOME === 'true';
const LOGO_HREF = HOME_ENABLED ? '/dashboard/home' : '/dashboard';

// The mobile create button, and it is the exact complement of the labelled
// pill below: that one is `lg:inline-flex` under this flag, so this fills
// everything under lg and the two can never both be on screen.
//
// Flag OFF it renders nowhere, deliberately. Without the flag the pill shows
// from `sm` and MobileNavBar is not mounted at all, so an `lg:hidden` icon
// would double the CTA across the whole sm-to-lg range — and below `sm` there
// was no topbar create button before this and adding one is not what moving
// the "+" was asked to do. Flag off, this file behaves exactly as it did.
const MOBILE_CREATE_DISPLAY = MOBILE_NAV_ENABLED ? 'grid lg:hidden' : 'hidden';

type AppTopbarProps = {
  /** Opens the release creation modal. Lifted to AppShell so this universal
   * button behaves identically to the page-level "New rollout" buttons
   * instead of navigating to the releases list. */
  onNewRelease?: () => void;
  /** Display name surfaced as the monogram on the workspace menu trigger.
   * Threaded from AppShell so the topbar doesn't need to read auth state
   * directly. */
  userName?: string;
};

// `/dashboard` is the consolidated workspace. We render NO title / eyebrow
// for it — the workspace IS the page, and a "Home / Workspace" label was
// just redundant. The min-w-0 flex-1 wrapper below stays empty there, which
// keeps the right-side controls flush right without any layout shift.
// Other routes keep their titles. `/dashboard/releases/[releaseId]` itself
// is now a redirect-only route (2026-08-04 — the release detail page was
// removed, its content absorbed into the workspace's scoped view) so it
// never mounts and never reaches this code; its sibling scene pages
// (calendar/epk/files/metadata) still live under this prefix and still
// want no static title, hence the startsWith match staying below.
const routeTitles = [
  { match: (pathname: string) => pathname === '/dashboard', title: '', eyebrow: '' },
  { match: (pathname: string) => pathname === '/dashboard/urgans', title: '', eyebrow: '' },
  { match: (pathname: string) => pathname.startsWith('/dashboard/releases'), title: '', eyebrow: '' },
  // Settings carries no topbar title either (founder call, 2026-07-23) —
  // the page's own section kickers say where you are.
  { match: (pathname: string) => pathname.startsWith('/settings'), title: '', eyebrow: '' },
];

/** The wordmark with a quiet ALPHA badge beside it. The badge is deliberately
 *  outlined and tertiary-coloured so the brand stays the dominant element, and
 *  it is positioned absolutely to the wordmark's right rather than sitting in
 *  the flow: the mobile logo is centred in the bar, and an in-flow badge would
 *  push the wordmark off true centre by half its own width. It also adds no
 *  width to the row's documented budget. Desktop is left-anchored, so
 *  there the badge simply sits in the flow. The badge lives here and not in
 *  `Logo`, which auth, invite and paywall pages share. Remove at launch. */
function BrandMark({ centered = false }: { centered?: boolean }) {
  return (
    <span className="relative inline-flex items-center gap-1.5">
      <Logo size="sm" priority className="opacity-90" />
      <span
        className={`pointer-events-none select-none rounded-full border border-stroke-default px-1.5 py-px text-[9px] font-semibold uppercase leading-none tracking-[0.14em] text-content-tertiary ${
          centered ? 'absolute left-full top-1/2 ml-1.5 -translate-y-1/2' : ''
        }`}
      >
        Beta
      </span>
    </span>
  );
}

function getRouteTitle(pathname: string | null) {
  const safePathname = pathname || '/dashboard';
  return routeTitles.find((item) => item.match(safePathname)) || routeTitles[0];
}

/**
 * The current release's identity fills the topbar's empty middle — cover
 * art + release title + date — so the open release owns that full space
 * between the logo and the nav (founder calls, 2026-07-23; replaces the
 * scope pill that sat inside the tasks panel AND the release page's own
 * mid-page header). Triggered by the workspace's `?release=` scope — the
 * only surface a release renders on since the release detail page was
 * removed (2026-08-04; it used to also match its own root path directly,
 * via a regex retired along with that page). Own component under Suspense
 * because useSearchParams needs a boundary when it renders from
 * layout-level chrome.
 */
function ContextTitle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const releases = useReleaseStore((state) => state.releases);
  // A cache-first paint can carry a cover art URL whose 1h signed-URL TTL
  // has since expired. Fall back to the default mark rather than a
  // broken-image icon, keyed on the URL so a fresh one clears the failure.
  const [failedCoverArtUrl, setFailedCoverArtUrl] = useState<string | null>(null);

  const releaseId = pathname === '/dashboard' ? searchParams.get('release') : null;
  if (!releaseId) return null;

  const release = releases.find((r) => r.id === releaseId);
  if (!release) return null;

  // The full identity row — cover art thumbnail (or the U-mark default)
  // beside the kicker + title. This IS the focused release card now
  // (founder call, 2026-07-23): the card left the page body entirely so the
  // activities fill that space; its picture and name live here instead.
  // Hidden below lg: the topbar's centered slot is now spent on the
  // centered logo below that breakpoint (see AppTopbar's mobile logo), and
  // the drill-down's own back header already names the release on phones.
  return (
    <div className={`${MOBILE_NAV_ENABLED ? 'hidden lg:flex' : 'hidden sm:flex'} min-w-0 items-center gap-3`}>
      <div className="hidden h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-stroke-subtle bg-bg-elevated sm:block">
        {release.coverArtUrl && release.coverArtUrl !== failedCoverArtUrl ? (
          <Image
            src={release.coverArtUrl}
            alt=""
            width={40}
            height={40}
            className="h-full w-full object-cover"
            onError={() => setFailedCoverArtUrl(release.coverArtUrl ?? null)}
          />
        ) : (
          <div className="grid h-full w-full place-items-center" aria-hidden="true">
            <Image
              src="/images/urganize-mark.png"
              alt=""
              width={161}
              height={173}
              className="app-wordmark h-4 w-auto opacity-40"
            />
          </div>
        )}
      </div>
      {/* Release name only — the artist kicker was dropped (founder call,
          2026-07-23: one artist per roster makes it redundant up here). */}
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate font-display text-lg font-semibold leading-6 text-content-primary sm:text-xl">
            {release.title}
          </h1>
          {release.releaseDate ? (
            <span className="hidden shrink-0 font-mono text-[11px] text-content-tertiary md:inline">
              {new Intl.DateTimeFormat('en', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              }).format(new Date(`${release.releaseDate}T00:00:00`))}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Plain, pathname-agnostic fallback for CatalogTopbarAction's Suspense
// boundary — same reasoning as ChappiLinkFallback below: a slow/unresolved
// useSearchParams read should never block the icon from painting.
const CatalogLinkFallback = (
  <Link
    href="/dashboard"
    aria-label="Catalog"
    title="Catalog"
    className={`motion-focus motion-press ${NAV_ICON_DISPLAY} h-10 w-10 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary`}
  >
    <CatalogIcon className="h-[18px] w-[18px]" />
  </Link>
);

// Fallback for the Suspense boundary below, so a slow/unresolved
// useSearchParams read never blocks the icon from painting. Still a plain
// Link — no store reads, no router calls — but it is NOT pathname-agnostic
// any more (2026-08-19): /dashboard/urgans prerenders `○ Static`, and a
// client component reading useSearchParams bails to its fallback during
// prerender, so THIS is the icon in that page's shipped HTML until hydration.
// Pointing it at the page it is already on made it a dead tap for exactly the
// weak-connection window where a dead tap costs the most. usePathname is safe
// to read here — only useSearchParams triggers the bailout this fallback
// exists to cover.
//
// No scope restore in this branch, unlike the hydrated control: the
// assistant's scope lives in an ephemeral store that is empty before
// hydration, so '/dashboard' is the whole of the correct answer here.
function ChappiLinkFallback() {
  const pathname = usePathname();
  const onAssistantPage = pathname === '/dashboard/urgans';
  return (
    <Link
      href={onAssistantPage ? '/dashboard' : '/dashboard/urgans'}
      aria-label="UrgAns"
      title="UrgAns"
      data-tour="nav-urgans"
      className={`motion-focus motion-press ${NAV_ICON_DISPLAY} h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${
        onAssistantPage
          ? 'bg-brand/10 text-brand'
          : 'text-content-tertiary hover:bg-bg-hover hover:text-content-primary'
      }`}
    >
      <ChappiIcon className="h-[18px] w-[18px]" />
    </Link>
  );
}

/**
 * The Catalog/Workspace topbar icon — mirrors ChappiTopbarAction below so
 * the pair are symmetric toggles (URG-211; the catalog icon was a dead
 * click when already at rest on /dashboard, since its href resolved to the
 * current URL). With a release drilled in it stays a plain Link (a real
 * navigation that clears `?release=`, unchanged from before); only fully
 * at rest does it become a button whose click "closes" the catalog by
 * pushing to the UrgAns page — the inverse of how ChappiTopbarAction
 * opens the catalog. Needs its own Suspense boundary (useSearchParams) —
 * same reason ChappiTopbarAction and ContextTitle have one.
 */
function CatalogTopbarAction() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isAtRest = pathname === '/dashboard' && !searchParams.get('release');

  if (isAtRest) {
    return (
      <button
        type="button"
        onClick={() => router.push('/dashboard/urgans')}
        aria-label="Catalog"
        title="Catalog"
        data-tour="nav-catalog"
        aria-pressed
        className={`motion-focus motion-press ${NAV_ICON_DISPLAY} h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand transition-colors`}
      >
        <CatalogIcon className="h-[18px] w-[18px]" />
      </button>
    );
  }

  return (
    <Link
      href="/dashboard"
      // Leaving a release forgets its scene AND records that the catalog was
      // asked for, so the lone-release auto-scope cannot undo this navigation.
      // One of five surfaces that make the same move — see
      // lib/catalog-intent.ts. Safe from any page, scoped or not.
      onClick={leaveReleaseForCatalog}
      aria-label="Catalog"
      title="Catalog"
      data-tour="nav-catalog"
      className={`motion-focus motion-press ${NAV_ICON_DISPLAY} h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${
        pathname === '/dashboard'
          ? 'bg-brand/10 text-brand'
          : 'text-content-tertiary hover:bg-bg-hover hover:text-content-primary'
      }`}
    >
      <CatalogIcon className="h-[18px] w-[18px]" />
    </Link>
  );
}

/**
 * The UrgAns topbar icon — the persistent open/close affordance for the
 * side rail (URG-210). ON the assistant page it CLOSES that surface by
 * switching to the workspace, the exact inverse of CatalogTopbarAction's
 * at-rest branch above; the rail doesn't exist there, so there is nothing
 * local to toggle. Everywhere else at lg+ it toggles the side rail (no
 * navigation, no page transition); below lg it navigates to the full page
 * instead — the rail doesn't exist on small viewports — carrying the
 * drilled-in release as the assistant's scope when the catalog has one
 * (module-scope store — safe to set synchronously right before the push).
 * Needs its own Suspense boundary (useSearchParams) — same reason
 * ContextTitle has one.
 */
function ChappiTopbarAction() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isRailOpen = useChappiStore((state) => state.railOpen);
  const setRailOpen = useChappiStore((state) => state.setRailOpen);

  // Fixed 2026-08-19: this branch used to render a <Link> pointing at the
  // page it was already on — a dead click, and a direct contradiction of the
  // pair's documented URG-211 contract ("clicking either one while it's
  // already the surface you're on closes it by switching to the other"),
  // which CatalogTopbarAction has always honoured and this one never did.
  //
  // Restoring `?release=` rather than pushing a bare '/dashboard' is
  // deliberate: ChappiPageClient's "Collapse into workspace" control performs
  // this same assistant-page -> workspace transition and already resumes the
  // assistant's scope, so leaving it out here would give one transition two
  // different outcomes depending on which control you used. It also keeps the
  // round trip lossless — drill into a release, open UrgAns, close it, and you
  // are back in that release rather than dumped at the catalog.
  //
  // Deliberately does NOT force the rail open, unlike that collapse control.
  // "Collapse into workspace" is an explicit request for the split view, so
  // overriding an earlier close is right there; this is a request to leave the
  // assistant, and re-opening a rail the user had closed would be a surprise.
  if (pathname === '/dashboard/urgans') {
    return (
      <button
        type="button"
        onClick={() => {
          const { scopedReleaseId } = useChappiStore.getState();
          router.push(scopedReleaseId ? `/dashboard?release=${scopedReleaseId}` : '/dashboard');
        }}
        aria-label="UrgAns"
        title="UrgAns"
        data-tour="nav-urgans"
        // Pressed: this IS the open surface, and pressing again closes it —
        // the same semantics (and the same bare attribute) as the Workspace
        // icon's at-rest branch.
        aria-pressed
        className={`motion-focus motion-press ${NAV_ICON_DISPLAY} h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand transition-colors`}
      >
        <ChappiIcon className="h-[18px] w-[18px]" />
      </button>
    );
  }

  const handleClick = () => {
    const stacked =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
    if (stacked) {
      // Only set the scope when a release is actually drilled in — a bare
      // navigate (no scope) must not clobber a scope the user already
      // picked inside the assistant's own picker.
      const releaseId = pathname === '/dashboard' ? searchParams.get('release') : null;
      if (releaseId) {
        useChappiStore.getState().setScopedReleaseId(releaseId);
      }
      router.push('/dashboard/urgans');
      return;
    }
    setRailOpen(!isRailOpen);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="UrgAns"
      title="UrgAns"
      data-tour="nav-urgans"
      aria-pressed={isRailOpen}
      className={`motion-focus motion-press ${NAV_ICON_DISPLAY} h-10 w-10 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary ${
        // lg:-scoped so the tint can never light up below lg, where the
        // rail doesn't exist and this button is a plain navigate instead.
        isRailOpen ? 'lg:bg-brand/10 lg:text-brand lg:hover:bg-brand/10 lg:hover:text-brand' : ''
      }`}
    >
      <ChappiIcon className="h-[18px] w-[18px]" />
    </button>
  );
}

// Mobile topbar layout (centered logo, no New rollout button, no
// notifications bell below lg) landed in a previous deploy — this
// comment exists only to produce a diff on apps/web and force a fresh
// Vercel build/deploy of the Web project. Second retry: the prior two
// pushes to main did not appear to trigger a Vercel deployment at all,
// which points at the Git integration/webhook rather than the code.
export function AppTopbar({ onNewRelease, userName }: AppTopbarProps) {
  const pathname = usePathname();
  // The "You" link opens the settings pop-up in place. It stays a real link (to
  // a URL that opens the pop-up on a fresh load), so a new tab still works.
  const openSettingsOnClick = useSettingsLinkClick();
  const routeTitle = getRouteTitle(pathname);
  const { openQuickCreate } = useTaskUI();
  // Tri-state: null means the capability probe is still in flight, so the
  // control stays out rather than flashing in and out. Only ever true for an
  // account that holds a curator_profiles row.
  const hasCuratorProfile = useAuthStore((state) => state.hasCuratorProfile);
  const showCuratorLink = PITCHING_ENABLED && hasCuratorProfile === true;

  /**
   * The mobile create button, moved here from MobileNavBar's centre (founder
   * call, 2026-09-06).
   *
   * Contextual, exactly as it was in the bar: on the workspace with a release
   * scoped it opens that release's quick-create, everywhere else it opens New
   * release. That behaviour was introduced when TasksPanel's own mobile "New
   * activity" pill was retired, so it has to travel with the button or that
   * pill's job goes unowned.
   *
   * Reads `window.location.search` at CLICK time rather than through
   * useSearchParams. The ACTION is then always right, including on the one
   * transition a render-time read would lag — scoping a release while already
   * on /dashboard, which is a same-pathname replace. The aria-label stays a
   * static "New rollout" for the same reason inverted: a label that is
   * sometimes wrong is worse than one that is honestly generic.
   */
  const isWorkspace = pathname === '/dashboard';
  const handleCreateClick = () => {
    if (typeof window !== 'undefined' && isWorkspace) {
      const releaseId = new URLSearchParams(window.location.search).get('release');
      if (releaseId) {
        openQuickCreate({ releaseId, source: 'inline' });
        return;
      }
    }
    onNewRelease?.();
  };

  return (
    <header className="sticky top-0 z-30 border-b border-stroke-subtle bg-bg-base/88 backdrop-blur-xl">
      {/* Tighter gap/padding below sm only. Before Notes, Shows and Pitching left this
          bar (2026-09-29, desktop menu reorganization) the phone-width bar
          carried logo + 3 nav icons + bell + account = 80 + 5x40 + gaps.
          At gap-3/px-4 that totals 352px against 343px of usable width at
          375px — a real overflow. gap-2/px-3 buys it back (328 vs 351) and
          still clears 360px; every value is restored from sm up, where the
          bar has ample slack. The 40px hit targets are the app-wide touch
          standard and are NOT what gives here.
          With NEXT_PUBLIC_FEATURE_MOBILE_NAV on, this math is moot below lg:
          the nav icons and the account trigger all move to
          MobileNavBar, leaving only the logo, the (now-visible) release
          context and the bell up here — comfortably under budget.
          A dual account (team + playlist owner) adds an EIGHTH control, which
          spends the slack gap-2 bought and overflows 375px by 13px — measured,
          with the scroll-lock padding cleared, since an open modal otherwise
          fakes exactly this number. gap-1.5 returns ~2px per gap, which covers
          it. Applied ONLY when that control is actually rendered, so the other
          accounts keep the roomier spacing they already fit in. */}
      <div
        className={`relative flex min-h-16 items-center ${
          showCuratorLink ? 'gap-1.5' : 'gap-2'
        } px-3 sm:gap-3 sm:px-5 md:px-6 lg:px-8`}
      >
        {/* Mobile: logo is centered in the bar (founder request) rather than
            anchored top-left — with the New rollout CTA and notifications
            bell both gone from this row below lg, a left-anchored logo would
            just sit alone off-center. Absolutely positioned so it doesn't
            take part in the flex flow the rest of this row uses; the parent
            div's own `relative` is its containing block. */}
        <Link
          href={LOGO_HREF}
          aria-label="Urganize home (alpha)"
          className="motion-focus absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity hover:opacity-80 lg:hidden"
        >
          <BrandMark centered />
        </Link>

        {/* Mobile: the account link, anchored top-LEFT (founder call,
            2026-08-31). It used to be a "You" tab in MobileNavBar; moving it up
            here is what leaves that bar four tabs around a centred "+".

            Top-left is the one corner of this row that was empty below lg — the
            logo is absolutely positioned at the centre and so takes part in no
            flex flow, and the right cluster is the bell and help. It is a plain
            Link to /settings rather than WorkspaceMenu (which stays lg-only):
            the account actions already live on that page, and a menu opening
            over a thumb at the top of a phone is worse than one tap through.

            THIS IS THE ONLY ROUTE TO SETTINGS ON A PHONE — the nav icons and
            WorkspaceMenu are both `hidden lg:grid`/`hidden lg:block` under
            NEXT_PUBLIC_FEATURE_MOBILE_NAV — so it renders on every chrome page
            unconditionally. Do not make it conditional without leaving another
            way in. */}
        <Link
          href={settingsDeepLink()}
          onClick={openSettingsOnClick}
          aria-label="You"
          title="You"
          data-tour="nav-settings"
          aria-current={pathname?.startsWith('/settings') ? 'page' : undefined}
          className={`motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors lg:hidden ${
            pathname?.startsWith('/settings')
              ? 'bg-brand/10 text-brand'
              : 'text-content-tertiary hover:bg-bg-hover hover:text-content-primary'
          }`}
        >
          <ProfileIcon className="h-[18px] w-[18px]" aria-hidden />
        </Link>

        {/* Desktop: logo anchored left, as before. Links back to home
            (LOGO_HREF) so the top-left "click the logo" affordance still
            gets users home from any inner route. No text label — the mark
            itself is the brand. */}
        <Link
          href={LOGO_HREF}
          aria-label="Urganize home (alpha)"
          className="motion-focus hidden shrink-0 transition-opacity hover:opacity-80 lg:inline-flex"
        >
          <BrandMark />
        </Link>

        {/* Spacer takes flex-1 so the right-side controls stay flush right;
            its content is centered within that leftover width (founder
            call, 2026-08-06) so the scoped release's identity reads as the
            bar's focal point instead of hugging the logo. Centering here —
            rather than against the bar's raw midpoint — is overlap-safe: the
            slot's width is already bounded by two fixed-width neighbors (the
            logo, the action cluster), so its content can never be pushed
            into either one, whatever their relative widths are. Eyebrow +
            title are conditional so empty routeTitle entries (e.g.
            /dashboard) don't reserve vertical space. */}
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <div className="min-w-0">
            {/* On the scoped workspace, the open release's activities own
                this space; static route titles fill it elsewhere. Both are
                empty on the at-rest /dashboard, keeping the controls flush
                right. */}
            <Suspense fallback={null}>
              <ContextTitle />
            </Suspense>
            {routeTitle.eyebrow ? (
              <p className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary sm:block">
                {routeTitle.eyebrow}
              </p>
            ) : null}
            {routeTitle.title ? (
              <h1 className="truncate font-display text-lg font-semibold leading-6 text-content-primary sm:text-xl">
                {routeTitle.title}
              </h1>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={onNewRelease}
          data-tour="new-rollout"
          className={`motion-focus motion-press hidden h-10 items-center gap-2 rounded-full border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse shadow-[0_18px_36px_-28px_rgb(var(--color-brand)/0.55)] hover:bg-brand-hover ${
            // Below lg, MobileNavBar's center button is the create
            // affordance — showing both would be a double CTA on tablets.
            MOBILE_NAV_ENABLED ? 'lg:inline-flex' : 'sm:inline-flex'
          }`}
        >
          <Plus className="h-4 w-4" />
          <span>New rollout</span>
        </button>

        {/* The app's two surfaces as a topbar pair: Workspace (releases +
            tasks) and UrgAns (the conversational landing). Each highlights
            when active via an exact pathname match, and each is a real
            toggle (URG-211): clicking either one while it's already the
            surface you're on closes it by switching to the other. Only
            rendered once the assistant exists as a surface — with the flag
            off, /dashboard is the only surface and needs no switcher. Sits
            left of NotificationsBell, same slot pattern. */}
        {/* Nav icons follow the help "?"'s quiet voice (founder call,
            2026-07-23): no boxed borders at rest — tertiary ink that
            brightens on hover, a soft round hover fill, and brand ink only
            on the active surface. The New rollout CTA stays the one filled
            control up here. */}
        {CHAPPI_ENABLED ? (
          <>
            {/* UrgAns leads the pair (founder call, 2026-09-09), matching the
                identity card's nav and the post-auth landing. The two are
                still mutual toggles; only their order moved. */}
            <Suspense fallback={<ChappiLinkFallback />}>
              <ChappiTopbarAction />
            </Suspense>
            <Suspense fallback={CatalogLinkFallback}>
              <CatalogTopbarAction />
            </Suspense>
          </>
        ) : null}

        {/* Playlist pitches — the crossing point for a dual account (team +
            playlist owner). It is a plain destination outside the
            Catalog/UrgAns toggle pair, and it leaves the team app entirely
            (/curator is a standalone route with its own shell), so it lights
            up on a prefix match rather than an exact one. */}
        {showCuratorLink ? (
          <Link
            href="/curator"
            aria-label="Playlist pitches"
            title="Playlist pitches"
            className={`motion-focus motion-press ${NAV_ICON_DISPLAY} h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${
              pathname?.startsWith('/curator')
                ? 'bg-brand/10 text-brand'
                : 'text-content-tertiary hover:bg-bg-hover hover:text-content-primary'
            }`}
          >
            <Inbox className="h-[18px] w-[18px]" />
          </Link>
        ) : null}

        {/* Phase 1 notifications surface — gated internally on
            NEXT_PUBLIC_FEATURE_WORKSPACE so prod can keep the topbar exactly
            as it was until the bell is flipped on. Sits left of WorkspaceMenu
            so the account monogram remains the rightmost control. Hidden
            below lg (founder request) — the mobile bar has no room for it
            once the logo takes the centered slot, and MobileNavBar has no
            notifications tab to move it to. */}
        <div className="hidden lg:block">
          <NotificationsBell />
        </div>

        {/* Help "?" — moved up from the bottom-left corner (2026-07-23);
            same quiet mono launcher, now among the rest of the nav. */}
        <HelpMenu />

        <WorkspaceMenu
          userName={userName}
          className={MOBILE_NAV_ENABLED ? 'hidden lg:block' : undefined}
        />

        {/* Mobile create, top-RIGHT (founder call, 2026-09-06). It was the
            centred "+" in MobileNavBar; moving it up here is what lets that
            bar be a plain row of tabs.

            LAST in this cluster on purpose, so it is the rightmost control at
            every width below lg. Everything above it here is `lg:` or `md:`
            gated, so on a phone this is the only thing on this side and it
            balances the account link anchored top-LEFT.

            The labelled pill above stays lg-only and keeps plain
            onNewRelease: on desktop TasksPanel still has its own New activity
            button, so making that one contextual would change a behaviour
            nobody asked to change. The two never render together. */}
        <button
          type="button"
          onClick={handleCreateClick}
          aria-label="New rollout"
          title="New rollout"
          data-tour="new-rollout"
          className={`motion-focus motion-press ${MOBILE_CREATE_DISPLAY} h-10 w-10 shrink-0 place-items-center rounded-full border border-brand/25 bg-brand text-content-inverse shadow-[0_18px_36px_-28px_rgb(var(--color-brand)/0.55)] hover:bg-brand-hover`}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
