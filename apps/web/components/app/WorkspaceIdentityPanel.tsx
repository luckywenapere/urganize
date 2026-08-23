"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ClipboardList, Inbox, PanelLeftClose, PanelLeftOpen, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import { useWorkspaceIdentityStore } from "@/stores/useWorkspaceIdentityStore";
import { useReleaseStore } from "@/stores/useReleaseStore";
import { useChappiStore } from "@/stores/useChappiStore";
import { CatalogIcon, ChappiIcon, GearIcon, NotesIcon } from "@/components/app/BrandIcons";
import { SkeletonBlock } from "@/components/loading/SkeletonBlock";
import { readPersistedState, writePersistedState } from "@/lib/persisted-state";
import { isReleaseActive } from "@/lib/release-activity";

// Collapsed state — same lib/persisted-state pattern as the UrgAns rail's
// RAIL_OPEN_KEY, and for the same reason: pure UI-chrome state, so a reload
// shouldn't snap the layout back. Kept as local component state rather than a
// store (unlike railOpen) because nothing outside this panel toggles it — the
// card owns its own width and flexbox does the rest, so AppShell needs no
// changes.
const SIDEBAR_COLLAPSED_KEY = "urganize.workspace.sidebar-collapsed";
const SIDEBAR_COLLAPSED_VERSION = 1;
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

// Same flag TasksPanel's scene pill and MetadataSection read. At `lg`+ this
// card is the primary entry point ("Collect metadata" below); TasksPanel's
// own pill keeps a below-`lg` copy alive, since this card never renders on
// small viewports and dropping the pill there with no replacement would make
// Metadata unreachable on phones/tablets (2026-08-12).
const METADATA_ENABLED = process.env.NEXT_PUBLIC_FEATURE_METADATA === "true";

// The card's nav (URG-229). Same three global surfaces the topbar exposes,
// using the SAME hand-drawn marks (BrandIcons) so the two entry points read
// as one system. Active matching mirrors AppTopbar's: exact for /dashboard so
// a scoped release (?release=) still counts as the catalog, prefix for the
// others. Admin is appended separately below — it's visibility-gated.
type NavItem = {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
  isActive: (pathname: string) => boolean;
};

// Same flag AppTopbar reads for its Notes icon — the two entry points appear
// and disappear together.
const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === "true";

// One account can be both a team running releases and a playlist owner, so this
// card is where a dual account crosses back to its pitch inbox. Shown only when
// the account actually owns a curator profile (auth store's hasCuratorProfile);
// the /curator shell enforces the same thing for anyone who types the URL.
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === "true";

// NavItem.Icon must always return a ReactElement (matching the BrandIcons
// function components' signature); lucide-react's ForwardRefExoticComponent
// types its call signature as `ReactElement | null`, so it can't be assigned
// to that field directly — these thin wrappers close the gap.
function MetadataIcon({ className }: { className?: string }) {
  return <ClipboardList className={className} />;
}

function AdminIcon({ className }: { className?: string }) {
  return <ShieldCheck className={className} aria-hidden="true" />;
}

function PitchesIcon({ className }: { className?: string }) {
  return <Inbox className={className} aria-hidden="true" />;
}

/**
 * The two rows pinned to the BASE of the nav rather than sitting in the
 * scrolling list above (founder call, 2026-08-13), in this order: Admin, then
 * Settings below it. Both are account/operator surfaces rather than places
 * work happens, so they belong out of the way of the release surfaces — the
 * same reason the collapse control lives at the bottom of the card.
 *
 * Admin is additionally visibility-gated on the identity payload's isAdmin;
 * every /admin route still runs its own verifyAdmin server-side.
 */
const ADMIN_ITEM: NavItem = {
  href: "/admin",
  label: "Admin",
  Icon: AdminIcon,
  isActive: (pathname: string) => pathname.startsWith("/admin"),
};

const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  Icon: GearIcon,
  isActive: (pathname: string) => pathname.startsWith("/settings"),
};

/**
 * Built per-render (not a module constant like the old NAV_ITEMS) because the
 * "Collect metadata" entry needs runtime state: it targets the release
 * currently scoped in the URL, so it can't be a static href like its
 * neighbours. Added here 2026-08-12 as this card's persistent home for the
 * feature — Metadata is release-scoped, so unlike Catalog/UrgAns/Notes this
 * item only appears once a release is scoped (?release=), the
 * same gate TasksPanel's below-`lg` pill uses (`METADATA_ENABLED &&
 * scopedRelease`) so the two can't disagree about when the feature exists.
 */
function buildNavItems(
  scopedReleaseId: string | null,
  activeScene: string | null,
  hasCuratorProfile: boolean
): NavItem[] {
  return [
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
    // Exact match, like its neighbours: usePathname excludes the query string,
    // so a ?release= / ?note= deep link still lights this up.
    ...(NOTES_ENABLED
      ? [
          {
            href: "/dashboard/notes",
            label: "Notes",
            Icon: NotesIcon,
            isActive: (pathname: string) => pathname === "/dashboard/notes",
          },
        ]
      : []),
    // Fourth, after Notes (founder call, moved off its earlier "right after
    // UrgAns" placement). Active when the URL names this exact scene, not
    // just /dashboard, since Catalog above already owns the bare
    // scoped-release view.
    ...(METADATA_ENABLED && scopedReleaseId
      ? [
          {
            href: `/dashboard?release=${scopedReleaseId}&scene=metadata`,
            label: "Collect metadata",
            Icon: MetadataIcon,
            isActive: (pathname: string) => pathname === "/dashboard" && activeScene === "metadata",
          },
        ]
      : []),
    // The crossing point for an account that is also a playlist owner. Last in
    // the scrolling list because it leaves this workspace entirely: /curator is
    // a standalone route (AppShell drops all team chrome there), so it is a
    // neighbour of the release surfaces rather than one of them.
    ...(PITCHING_ENABLED && hasCuratorProfile
      ? [
          {
            href: "/curator",
            label: "Playlist pitches",
            Icon: PitchesIcon,
            isActive: (pathname: string) => pathname.startsWith("/curator"),
          },
        ]
      : []),
    // Settings and Admin deliberately do NOT belong here — they're pinned to
    // the base of the nav instead (see ADMIN_ITEM / SETTINGS_ITEM above).
  ];
}

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
  // null while the capability probe is in flight; treated as "no" for rendering,
  // so the row pops in rather than reserving space for an account that will
  // never have it (the same tradeoff Admin's row makes below).
  const hasCuratorProfile = useAuthStore((state) => state.hasCuratorProfile);
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

  // Always false for the first paint so SSR and the initial client render
  // agree; the mount effect below then applies the stored choice. Same
  // SSR-safe hydration order AppShell uses for the UrgAns rail.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const persisted = readPersistedState(
      SIDEBAR_COLLAPSED_KEY,
      SIDEBAR_COLLAPSED_VERSION,
      isBoolean,
    );
    if (persisted !== null) setCollapsed(persisted);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      writePersistedState(SIDEBAR_COLLAPSED_KEY, SIDEBAR_COLLAPSED_VERSION, next);
      return next;
    });
  }, []);

  useEffect(() => {
    void load();
    // Non-forced: dedupes against WorkspaceView's own load via the store's
    // recency guard. This panel is the only chrome that also needs releases
    // on pages without a WorkspaceView mount (Settings, per-release scenes),
    // so it can't just assume something else already fetched them.
    void loadCommandCenter();
  }, [load, loadCommandCenter]);

  // Shared with the Manager tier's active-release ceiling (lib/release-activity.ts),
  // so the number shown here and the number the cap counts cannot disagree.
  const activeReleaseCount = releases.filter((release) =>
    isReleaseActive(release.status),
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
      //
      // Collapsed, the card is a 64px icon rail rather than hidden outright:
      // hiding it would leave the topbar as the only way to reach these
      // surfaces, which is what the rail exists to avoid. 64px fits the 40px
      // hit targets plus the card's own padding.
      //
      // The rail-competition rule (see railIsCompeting) is relaxed while
      // collapsed — the width-budget note it defends is about THREE full
      // columns squeezing the centre; a 64px rail costs ~176px less, so at
      // lg-xl a collapsed card and an open UrgAns rail coexist fine. That
      // makes collapsing the user's own fix for the squeeze.
      className={`hidden shrink-0 self-start sticky top-[calc(5.25rem+1px)] ml-8 mr-8 h-[calc(100dvh-7.75rem-1px)] min-h-[24rem] transition-[width] duration-base ease-out ${
        collapsed ? "w-16" : "w-[240px]"
      } ${railIsCompeting && !collapsed ? "xl:block" : "lg:block"}`}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface">
        <Link
          href="/settings"
          title={collapsed ? name || "Your workspace" : undefined}
          className={`motion-focus block shrink-0 transition-colors hover:bg-bg-hover ${
            collapsed ? "px-2 py-4" : "p-4"
          }`}
        >
          {showSkeleton ? (
            collapsed ? (
              <SkeletonBlock className="mx-auto h-10 w-10 rounded-xl" />
            ) : (
              <div className="space-y-3">
                <SkeletonBlock className="h-14 w-14 rounded-xl" />
                <SkeletonBlock className="h-4 w-3/4 rounded" />
                <SkeletonBlock className="h-3 w-1/2 rounded" />
              </div>
            )
          ) : collapsed ? (
            // Collapsed identity: the mark alone, with the workspace name kept
            // in the accessibility tree (sr-only) so this link keeps the same
            // accessible name it has when expanded.
            <>
              {logo && !logoFailed ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed
                // Storage URL, same rationale as the expanded branch below.
                <img
                  src={logo.url}
                  alt=""
                  className="mx-auto h-10 w-10 rounded-xl border border-stroke-subtle object-cover"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl border border-stroke-subtle bg-bg-elevated">
                  <Image
                    src="/images/urganize-mark.png"
                    alt=""
                    aria-hidden="true"
                    width={24}
                    height={24}
                    className="app-wordmark h-6 w-6 object-contain"
                  />
                </div>
              )}
              <span className="sr-only">{name || "Your workspace"}</span>
            </>
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
          A flex column so Admin + Settings can pin to its base while the
          release surfaces above them take the remaining height and scroll on a
          short viewport rather than overflowing the fixed-height card. */}
        <nav
          aria-label="Workspace navigation"
          className="flex min-h-0 flex-1 flex-col border-t border-stroke-subtle p-2"
        >
          {/* WorkspaceNavLinks needs useSearchParams (to find the currently
            scoped release for "Collect metadata"), and this panel is mounted
            from layout-level chrome (AppShell) rather than a page — same
            reason AppTopbar's ContextTitle/CatalogTopbarAction/ChappiTopbarAction
            each get their own Suspense boundary. Fallback renders the nav
            without the release-dependent item (equivalent to no release being
            scoped yet), never a spinner, so the rest of the nav never blocks
            on it. */}
          <Suspense
            fallback={
              <WorkspaceNavList
                navItems={buildNavItems(null, null, hasCuratorProfile === true)}
                pathname={pathname}
                isAdmin={isAdmin}
                collapsed={collapsed}
              />
            }
          >
            <WorkspaceNavLinks
              pathname={pathname}
              isAdmin={isAdmin}
              collapsed={collapsed}
              hasCuratorProfile={hasCuratorProfile === true}
            />
          </Suspense>
        </nav>

        {/* Collapse control, pinned to the base of the card (founder call,
          2026-08-12). The nav above it is `flex-1`, so this row needs no
          positioning of its own — it simply takes the space left over at the
          bottom. It is a sibling of the identity <Link> rather than a child:
          a <button> cannot nest inside an <a>. Right-aligned when expanded so
          the left-pointing icon reads as "push the panel closed"; centered
          when collapsed to sit over the icon column above it. */}
        <div
          className={`flex shrink-0 items-center border-t border-stroke-subtle p-2 ${
            collapsed ? "justify-center" : "justify-end"
          }`}
        >
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand workspace menu" : "Collapse workspace menu"}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            className="motion-focus motion-press grid h-8 w-8 shrink-0 place-items-center rounded-lg text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Reads the search params `buildNavItems` needs, then hands off to the
 * plain (Suspense-free) list renderer below. Split out purely so the
 * Suspense boundary above wraps only the part that actually calls
 * useSearchParams. */
function WorkspaceNavLinks({
  pathname,
  isAdmin,
  collapsed,
  hasCuratorProfile,
}: {
  pathname: string | null;
  isAdmin: boolean;
  collapsed: boolean;
  hasCuratorProfile: boolean;
}) {
  const searchParams = useSearchParams();
  // Same `?release=` / `?scene=` params useReleaseScope / useSceneOverlay own
  // — read directly here (not via those hooks) since this component only
  // needs them to build one nav href, not to read or write scene state.
  const scopedReleaseId = searchParams.get("release");
  const activeScene = searchParams.get("scene");
  const navItems = buildNavItems(scopedReleaseId, activeScene, hasCuratorProfile);
  return (
    <WorkspaceNavList
      navItems={navItems}
      pathname={pathname}
      isAdmin={isAdmin}
      collapsed={collapsed}
    />
  );
}

/** Collapsed rows center a single icon; the label stays in the DOM as sr-only
 * rather than being swapped for an aria-label, so the accessible name is
 * identical in both states and can't drift. `title` gives sighted users the
 * native tooltip that replaces the missing text. */
const navRowClass = (active: boolean, collapsed: boolean) =>
  `motion-focus mb-0.5 flex items-center rounded-lg py-2 text-sm transition-colors ${
    collapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
  } ${
    active
      ? "bg-brand/10 text-brand"
      : "text-content-secondary hover:bg-bg-hover hover:text-content-primary"
  }`;

/** Plain render of the nav rows — no hooks of its own, so it doubles as the
 * Suspense fallback (called directly with a release-less item list) and the
 * resolved output (via WorkspaceNavLinks above). Renders the scrolling list of
 * release surfaces plus the pinned Admin/Settings group at the base; the two
 * are direct flex children of the <nav> above, so this component's fragment
 * has to stay transparent (no wrapper element). */
function WorkspaceNavList({
  navItems,
  pathname,
  isAdmin,
  collapsed,
}: {
  navItems: NavItem[];
  pathname: string | null;
  isAdmin: boolean;
  collapsed: boolean;
}) {
  const renderRow = ({ href, label, Icon, isActive }: NavItem) => {
    const active = isActive(pathname || "");
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        title={collapsed ? label : undefined}
        className={navRowClass(active, collapsed)}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className={collapsed ? "sr-only" : undefined}>{label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* The release surfaces: they take the leftover height and scroll, so a
        short viewport clips this list rather than pushing Admin/Settings off
        the base of the card. */}
      <div className="min-h-0 flex-1 overflow-y-auto">{navItems.map(renderRow)}</div>

      {/* Pinned to the base, Admin above Settings (founder call, 2026-08-13).
        Its own top divider separates the account/operator rows from the
        release surfaces above, mirroring the collapse control's divider
        below it.

        Admin's row is deliberately NOT skeleton-reserved (URG-232): isAdmin
        only resolves post-hydration, so a placeholder would flash for every
        non-admin viewer just to save an admin one pop-in — the same "pop-in
        beats vanishing" tradeoff ChappiPageSkeleton's doc comment makes for
        the invite-teammates banner. Settings sits below it either way, so an
        admin's Admin row appears above an already-placed Settings rather
        than shifting it. */}
      <div className="mt-2 shrink-0 border-t border-stroke-subtle pt-2">
        {isAdmin ? renderRow(ADMIN_ITEM) : null}
        {renderRow(SETTINGS_ITEM)}
      </div>
    </>
  );
}
