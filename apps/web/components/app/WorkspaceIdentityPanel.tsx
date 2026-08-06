"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useWorkspaceIdentityStore } from "@/stores/useWorkspaceIdentityStore";
import { useReleaseStore } from "@/stores/useReleaseStore";
import { useChappiStore } from "@/stores/useChappiStore";
import { CatalogIcon, ChappiIcon, GearIcon } from "@/components/app/BrandIcons";
import { SkeletonBlock } from "@/components/loading/SkeletonBlock";

// The card's nav (URG-229). Same three global surfaces the topbar exposes,
// using the SAME hand-drawn marks (BrandIcons) so the two entry points read
// as one system. Active matching mirrors AppTopbar's: exact for /dashboard so
// a scoped release (?release=) still counts as the catalog, prefix for the
// others. Admin is appended separately below — it's visibility-gated.
const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Catalog",
    Icon: CatalogIcon,
    isActive: (pathname: string) => pathname === "/dashboard",
  },
  {
    href: "/dashboard/urgans",
    label: "UrgAns",
    Icon: ChappiIcon,
    isActive: (pathname: string) => pathname === "/dashboard/urgans",
  },
  {
    href: "/settings",
    label: "Settings",
    Icon: GearIcon,
    isActive: (pathname: string) => pathname.startsWith("/settings"),
  },
] as const;

// Statuses that count as "still being worked" for the card's stat line.
// Mirrors the URG-214 Linear issue's proposed definition — a release stops
// counting once it's shipped or shelved.
const INACTIVE_RELEASE_STATUSES = new Set(["released", "archived"]);

// Same inline flag read AppShell uses for the UrgAns rail — needed here too
// so this panel knows whether a rail could even be competing for width.
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === "true";

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
  const isAdmin = useWorkspaceIdentityStore((state) => state.isAdmin);
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
  const isChappiRoute = pathname === "/dashboard/urgans";
  const railIsCompeting = CHAPPI_ENABLED && !isChappiRoute && railOpen;

  // A signed logo URL can expire while the tab stays open (see
  // ASSET_SIGNED_URL_TTL_SECONDS); onError below falls back to the Urganize
  // mark rather than a broken image, and this flag resets whenever the store
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
    (release) => !INACTIVE_RELEASE_STATUSES.has(release.status),
  ).length;

  const showSkeleton = !hydrated;

  return (
    <aside
      aria-label="Workspace"
      // Height calc is copied from ChappiSidePanel so the two columns are the
      // same length: topbar 4rem + 1px border + <main>'s pt-5 (1.25rem) =
      // 5.25rem top offset; 100dvh minus that minus main's md:pb-10 (2.5rem)
      // = 7.75rem total. Founder call (2026-08-06): the card runs to the base
      // of the viewport like the UrgAns rail rather than hugging its content.
      //
      // ml-8 (URG-231) is the LEFT-edge mirror of the rail's mr-8: the topbar's
      // inner container carries lg:px-8, so app content sits 32px inside the
      // 1440px page container (logo at x=152, rightmost control ending at
      // x=1528, which is exactly where the rail's mr-8 puts its right edge).
      // Without ml-8 this card started flush at the container edge — 32px left
      // of the logo directly above it, making the page's left and right gaps
      // asymmetric (120 vs 152, measured). Keep both margins in step.
      className={`hidden w-[240px] shrink-0 self-start sticky top-[calc(5.25rem+1px)] ml-8 mr-8 h-[calc(100dvh-7.75rem-1px)] min-h-[24rem] ${
        railIsCompeting ? "xl:block" : "lg:block"
      }`}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface">
        <Link
          href="/settings"
          className="motion-focus block shrink-0 p-4 transition-colors hover:bg-bg-hover"
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
                // Default when the workspace has no logo of its own (founder
                // call, 2026-08-06): the Urganize mark, not the workspace's
                // initials. Same asset + `app-wordmark` light-theme invert the
                // loading screen and topbar wordmark use, so the three brand
                // surfaces can't drift. Decorative — the workspace name renders
                // directly below it, so alt="" + aria-hidden.
                <div className="grid h-14 w-14 place-items-center rounded-xl border border-stroke-subtle bg-bg-elevated">
                  <Image
                    src="/images/urganize-mark.png"
                    alt=""
                    aria-hidden="true"
                    width={32}
                    height={32}
                    className="app-wordmark h-8 w-8 object-contain"
                  />
                </div>
              )}

              <p
                className="mt-3 truncate font-display text-sm text-content-primary"
                title={name}
              >
                {name || "Your workspace"}
              </p>
              {artist ? (
                <p
                  className="mt-0.5 truncate text-xs text-content-secondary"
                  title={artist.name}
                >
                  {artist.name}
                </p>
              ) : null}

              <p className="mt-3 text-[11px] text-content-tertiary">
                {memberCount} teammate{memberCount === 1 ? "" : "s"} ·{" "}
                {activeReleaseCount} active release
                {activeReleaseCount === 1 ? "" : "s"}
              </p>
            </>
          )}
        </Link>

        {/* Nav (URG-229). Sibling of the identity Link, never nested inside it —
          an <a> can't contain other <a>s. Deliberately duplicates the topbar's
          Catalog/UrgAns icons (founder call): they stay because they're the
          only way to reach those surfaces below lg, where this card is hidden.
          `min-h-0 overflow-y-auto` so a short viewport scrolls the nav rather
          than overflowing the fixed-height card. */}
        <nav
          aria-label="Workspace navigation"
          className="min-h-0 flex-1 overflow-y-auto border-t border-stroke-subtle p-2"
        >
          {NAV_ITEMS.map(({ href, label, Icon, isActive }) => {
            const active = isActive(pathname || "");
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`motion-focus mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  active
                    ? "bg-brand/10 text-brand"
                    : "text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}

          {/* Admin is visibility-gated on the identity payload's isAdmin; every
            /admin route still runs its own verifyAdmin server-side. */}
          {isAdmin ? (
            <Link
              href="/admin"
              aria-current={pathname?.startsWith("/admin") ? "page" : undefined}
              className={`motion-focus mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                pathname?.startsWith("/admin")
                  ? "bg-brand/10 text-brand"
                  : "text-content-secondary hover:bg-bg-hover hover:text-content-primary"
              }`}
            >
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              Admin
            </Link>
          ) : null}
        </nav>
      </div>
    </aside>
  );
}
