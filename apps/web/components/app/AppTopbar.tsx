'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Logo } from '@urganize/ui';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { WorkspaceMenu } from '@/components/app/WorkspaceMenu';
import { NotificationsBell } from '@/components/app/NotificationsBell';
import { HelpMenu } from '@/components/app/HelpMenu';
import { CatalogIcon, ChappiIcon } from '@/components/app/BrandIcons';

// Same flag ChappiPageClient reads. Inlined at build time (NEXT_PUBLIC_
// prefix) so the icon only appears once Chappi's own dedicated page is
// reachable.
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

type AppTopbarProps = {
  /** Opens the release creation modal. Lifted to AppShell so this universal
   * button behaves identically to the page-level "New release" buttons
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
// Other routes keep their titles. The detail route under
// /dashboard/releases/[releaseId] still uses the Releases startsWith match
// (the list /dashboard/releases 308-redirects to /dashboard and never
// reaches this code).
const routeTitles = [
  { match: (pathname: string) => pathname === '/dashboard', title: '', eyebrow: '' },
  { match: (pathname: string) => pathname === '/dashboard/chappi', title: '', eyebrow: '' },
  // Release detail's identity renders live (artist + title) via
  // ContextTitle below — no static fallback text.
  { match: (pathname: string) => pathname.startsWith('/dashboard/releases'), title: '', eyebrow: '' },
  // Settings carries no topbar title either (founder call, 2026-07-23) —
  // the page's own section kickers say where you are.
  { match: (pathname: string) => pathname.startsWith('/settings'), title: '', eyebrow: '' },
];

function getRouteTitle(pathname: string | null) {
  const safePathname = pathname || '/dashboard';
  return routeTitles.find((item) => item.match(safePathname)) || routeTitles[0];
}

/**
 * The current release's identity fills the topbar's empty middle — a mono
 * kicker over the song title — so the open release owns that full space
 * between the logo and the nav (founder calls, 2026-07-23; replaces the
 * scope pill that sat inside the tasks panel AND the release page's own
 * mid-page header). Two contexts:
 *  - workspace with ?release= → "ACTIVITIES" kicker + title
 *  - /dashboard/releases/[id] → artist-name kicker + title
 * Own component under Suspense because useSearchParams needs a boundary
 * when it renders from layout-level chrome.
 */
const RELEASE_DETAIL_PATH = /^\/dashboard\/releases\/([^/]+)$/;

function ContextTitle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const releases = useReleaseStore((state) => state.releases);

  let releaseId: string | null = null;

  if (pathname === '/dashboard') {
    releaseId = searchParams.get('release');
  } else {
    const detailMatch = (pathname || '').match(RELEASE_DETAIL_PATH);
    if (detailMatch) releaseId = detailMatch[1];
  }
  if (!releaseId) return null;

  const release = releases.find((r) => r.id === releaseId);
  if (!release) return null;
  // The kicker is the ARTIST, matching the card this row replaced (founder
  // annotation, 2026-07-23 — the "ACTIVITIES" wording was crossed out).
  const kicker = release.artistName || 'Release';

  // The full identity row — cover art thumbnail (or the U-mark default)
  // beside the kicker + title. This IS the focused release card now
  // (founder call, 2026-07-23): the card left the page body entirely so the
  // activities fill that space; its picture and name live here instead.
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="hidden h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-stroke-subtle bg-bg-elevated sm:block">
        {release.coverArtUrl ? (
          <Image
            src={release.coverArtUrl}
            alt=""
            width={40}
            height={40}
            className="h-full w-full object-cover"
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
      <div className="min-w-0">
        <p className="hidden truncate font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-content-tertiary sm:block">
          {kicker}
        </p>
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

export function AppTopbar({ onNewRelease, userName }: AppTopbarProps) {
  const pathname = usePathname();
  const routeTitle = getRouteTitle(pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-stroke-subtle bg-bg-base/88 backdrop-blur-xl">
      <div className="flex min-h-16 items-center gap-3 px-4 sm:px-5 md:px-6 lg:px-8">
        {/* Stage 2: the logo now lives in the topbar (the sidebar that
            previously hosted it is gone). Links back to /dashboard so the
            top-left "click the logo" affordance still gets users home from
            any inner route. No text label — the mark itself is the brand. */}
        <Link
          href="/dashboard"
          aria-label="Urganize home"
          className="motion-focus shrink-0 transition-opacity hover:opacity-80"
        >
          <Logo size="sm" priority className="opacity-90" />
        </Link>

        {/* Spacer takes flex-1 so the right-side controls stay flush right.
            Eyebrow + title are conditional so empty routeTitle entries
            (e.g. /dashboard) don't reserve vertical space. */}
        <div className="min-w-0 flex-1">
          {/* On the scoped workspace, the open release's activities own this
              space; static route titles fill it elsewhere. Both are empty on
              the at-rest /dashboard, keeping the controls flush right. */}
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

        <button
          type="button"
          onClick={onNewRelease}
          className="motion-focus motion-press hidden h-10 items-center gap-2 rounded-full border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse shadow-[0_18px_36px_-28px_rgb(var(--color-brand)/0.55)] hover:bg-brand-hover sm:inline-flex"
        >
          <Plus className="h-4 w-4" />
          <span>New release</span>
        </button>

        {/* The app's two surfaces as a topbar pair: Workspace (releases +
            tasks) and Chappi (the conversational landing). Each highlights
            when active via an exact pathname match. Only rendered once
            Chappi exists as a surface — with the flag off, /dashboard is the
            only surface and needs no switcher. Sits left of
            NotificationsBell, same slot pattern. */}
        {/* Nav icons follow the help "?"'s quiet voice (founder call,
            2026-07-23): no boxed borders at rest — tertiary ink that
            brightens on hover, a soft round hover fill, and brand ink only
            on the active surface. The New release CTA stays the one filled
            control up here. */}
        {CHAPPI_ENABLED ? (
          <>
            <Link
              href="/dashboard"
              aria-label="Workspace"
              title="Workspace"
              className={`motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${
                pathname === '/dashboard'
                  ? 'bg-brand/10 text-brand'
                  : 'text-content-tertiary hover:bg-bg-hover hover:text-content-primary'
              }`}
            >
              <CatalogIcon className="h-[18px] w-[18px]" />
            </Link>
            <Link
              href="/dashboard/chappi"
              aria-label="Chappi"
              title="Chappi"
              className={`motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${
                pathname === '/dashboard/chappi'
                  ? 'bg-brand/10 text-brand'
                  : 'text-content-tertiary hover:bg-bg-hover hover:text-content-primary'
              }`}
            >
              <ChappiIcon className="h-[18px] w-[18px]" />
            </Link>
          </>
        ) : null}

        {/* Phase 1 notifications surface — gated internally on
            NEXT_PUBLIC_FEATURE_WORKSPACE so prod can keep the topbar exactly
            as it was until the bell is flipped on. Sits left of WorkspaceMenu
            so the account monogram remains the rightmost control. */}
        <NotificationsBell />

        {/* Help "?" — moved up from the bottom-left corner (2026-07-23);
            same quiet mono launcher, now among the rest of the nav. */}
        <HelpMenu />

        <WorkspaceMenu userName={userName} />
      </div>
    </header>
  );
}
