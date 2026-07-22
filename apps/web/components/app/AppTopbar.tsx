'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, MessageCircle, Plus } from 'lucide-react';
import { Logo } from '@urganize/ui';
import { WorkspaceMenu } from '@/components/app/WorkspaceMenu';
import { NotificationsBell } from '@/components/app/NotificationsBell';
import { useEntitlementsStore } from '@/stores/useEntitlementsStore';
import { useUpsellStore } from '@/stores/useUpsellStore';

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
  { match: (pathname: string) => pathname.startsWith('/dashboard/releases'), title: 'Release', eyebrow: 'Release detail' },
  { match: (pathname: string) => pathname.startsWith('/settings'), title: 'Settings', eyebrow: 'Account' },
];

function getRouteTitle(pathname: string | null) {
  const safePathname = pathname || '/dashboard';
  return routeTitles.find((item) => item.match(safePathname)) || routeTitles[0];
}

export function AppTopbar({ onNewRelease, userName }: AppTopbarProps) {
  const pathname = usePathname();
  const routeTitle = getRouteTitle(pathname);
  const entitlements = useEntitlementsStore((state) => state.entitlements);
  const showUpsell = useUpsellStore((state) => state.show);
  // Entitlements haven't loaded yet (null) → don't block navigation on a
  // guess; the page-level gate (ChappiPageClient) and the server route are
  // the real enforcement either way. Once loaded, an explicit false gates.
  const chappiEntitled = entitlements === null || entitlements.chappiAssistant;

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
          className="motion-focus motion-press hidden h-10 items-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse shadow-[0_18px_36px_-28px_rgb(var(--color-brand)/0.55)] hover:bg-brand-hover sm:inline-flex"
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
        {CHAPPI_ENABLED ? (
          <>
            <Link
              href="/dashboard"
              aria-label="Workspace"
              title="Workspace"
              className={`motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center border transition-colors ${
                pathname === '/dashboard'
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-stroke-default bg-bg-elevated text-content-primary hover:bg-bg-hover'
              }`}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            </Link>
            {chappiEntitled ? (
              <Link
                href="/dashboard/chappi"
                aria-label="Chappi"
                title="Chappi"
                className={`motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center border transition-colors ${
                  pathname === '/dashboard/chappi'
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-stroke-default bg-bg-elevated text-content-primary hover:bg-bg-hover'
                }`}
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <button
                type="button"
                aria-label="Chappi — part of the paid plan"
                title="Chappi — part of the paid plan"
                onClick={() => showUpsell('chappiAssistant', 'topbar_chappi_icon')}
                className="motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center border border-stroke-default bg-bg-elevated text-content-tertiary transition-colors hover:bg-bg-hover"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </>
        ) : null}

        {/* Phase 1 notifications surface — gated internally on
            NEXT_PUBLIC_FEATURE_WORKSPACE so prod can keep the topbar exactly
            as it was until the bell is flipped on. Sits left of WorkspaceMenu
            so the account monogram remains the rightmost control. */}
        <NotificationsBell />

        <WorkspaceMenu userName={userName} />
      </div>
    </header>
  );
}
