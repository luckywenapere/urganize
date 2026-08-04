'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useChappiStore } from '@/stores/useChappiStore';
import { getInitials } from '@/lib/tasks';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

// Statuses that count as "still being worked" for the card's stat line.
// Mirrors the URG-214 Linear issue's proposed definition — a release stops
// counting once it's shipped or shelved.
const INACTIVE_RELEASE_STATUSES = new Set(['released', 'archived']);

// Same inline flag read AppShell uses for the UrgAns rail — needed here too
// so this panel knows whether a rail could even be competing for width.
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

/**
 * The workspace identity card (URG-214) — a LinkedIn-company-page-style
 * display of the record label / manager's logo, name, artist, and a couple
 * of at-a-glance counts. Display-only: every field shown here is edited in
 * Settings -> Workspace identity, never here.
 *
 * Mounted once by AppShell as a layout-flow LEFT column sibling of <main>
 * (mirroring ChappiSidePanel's right column), so it appears on every chrome
 * page without per-page wiring. Hidden below `lg`; AppShell additionally
 * hides it at lg-xl while the UrgAns rail is open (see the width-budget note
 * there) since two rails plus main would squeeze the center content.
 */
export function WorkspaceIdentityPanel() {
  const name = useWorkspaceIdentityStore((state) => state.name);
  const artist = useWorkspaceIdentityStore((state) => state.artist);
  const memberCount = useWorkspaceIdentityStore((state) => state.memberCount);
  const logo = useWorkspaceIdentityStore((state) => state.logo);
  const hydrated = useWorkspaceIdentityStore((state) => state.hydrated);
  const load = useWorkspaceIdentityStore((state) => state.load);
  const releases = useReleaseStore((state) => state.releases);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const railOpen = useChappiStore((state) => state.railOpen);
  const pathname = usePathname();

  // The UrgAns rail (see ChappiSidePanel) renders nowhere on its own page —
  // there, no width contest exists and this panel behaves like any other
  // chrome page. Everywhere else, an OPEN rail plus this panel plus <main>
  // would squeeze the center content at lg-xl (1024-1279px), so the rail
  // wins there and this panel waits for xl+ to reappear.
  const isChappiRoute = pathname === '/dashboard/urgans';
  const railIsCompeting = CHAPPI_ENABLED && !isChappiRoute && railOpen;

  // A signed logo URL can expire while the tab stays open (see
  // ASSET_SIGNED_URL_TTL_SECONDS); onError below falls back to initials
  // rather than a broken image, and this flag resets whenever the store
  // hands us a new URL (a fresh fetch or a Settings upload).
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => {
    setLogoFailed(false);
  }, [logo?.url]);

  useEffect(() => {
    void load();
    // Non-forced: dedupes against WorkspaceView's own load via the store's
    // recency guard. This panel is the only chrome that also needs releases
    // on pages without a WorkspaceView mount (Settings, per-release scenes),
    // so it can't just assume something else already fetched them.
    void loadCommandCenter();
  }, [load, loadCommandCenter]);

  const activeReleaseCount = releases.filter(
    (release) => !INACTIVE_RELEASE_STATUSES.has(release.status)
  ).length;

  const showSkeleton = !hydrated;

  return (
    <aside
      aria-label="Workspace identity"
      className={`hidden w-[240px] shrink-0 self-start sticky top-[calc(5.25rem+1px)] mr-8 ${
        railIsCompeting ? 'xl:block' : 'lg:block'
      }`}
    >
      <Link
        href="/settings"
        className="motion-focus block rounded-2xl border border-stroke-default bg-bg-surface p-4 transition-colors hover:bg-bg-hover"
      >
        {showSkeleton ? (
          <div className="space-y-3">
            <SkeletonBlock className="h-14 w-14 rounded-xl" />
            <SkeletonBlock className="h-4 w-3/4 rounded" />
            <SkeletonBlock className="h-3 w-1/2 rounded" />
          </div>
        ) : (
          <>
            {logo && !logoFailed ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed
              // Storage URL; next/image proxying/caching would break on TTL
              // expiry (same rationale as the public EPK page).
              <img
                src={logo.url}
                alt=""
                className="h-14 w-14 rounded-xl border border-stroke-subtle object-cover"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-xl border border-stroke-subtle bg-bg-elevated font-display text-lg text-content-secondary">
                {getInitials(name || 'Urganize')}
              </div>
            )}

            <p className="mt-3 truncate font-display text-sm text-content-primary" title={name}>
              {name || 'Your workspace'}
            </p>
            {artist ? (
              <p className="mt-0.5 truncate text-xs text-content-secondary" title={artist.name}>
                {artist.name}
              </p>
            ) : null}

            <p className="mt-3 text-[11px] text-content-tertiary">
              {memberCount} teammate{memberCount === 1 ? '' : 's'} · {activeReleaseCount} active
              release{activeReleaseCount === 1 ? '' : 's'}
            </p>
          </>
        )}
      </Link>
    </aside>
  );
}
