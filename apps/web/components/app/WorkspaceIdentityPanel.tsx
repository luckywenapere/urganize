"use client";

import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, ClipboardList, Inbox, PanelLeftClose, PanelLeftOpen, Radio, ShieldCheck, Users } from '@/components/icons';
import { SiInstagram, SiX } from "react-icons/si";
import { openExternalUrl } from "@/lib/external-link";
import { useAuthStore } from "@/lib/auth-store";
import { useWorkspaceIdentityStore } from "@/stores/useWorkspaceIdentityStore";
import { useReleaseStore } from "@/stores/useReleaseStore";
import { useChappiStore } from "@/stores/useChappiStore";
import { CatalogIcon, ChappiIcon, GearIcon, NotesIcon } from "@/components/app/BrandIcons";
import { MicVocal } from '@/components/icons';
import { SkeletonBlock } from "@/components/loading/SkeletonBlock";
import { readPersistedState } from "@/lib/persisted-state";
import { isReleaseActive } from "@/lib/release-activity";
import { leaveReleaseForCatalog } from "@/lib/catalog-intent";
import { HelpTipPanel } from "@/components/shared/HelpTip";
import type { HelpKey } from "@/lib/help-copy";
import { useSidebarStore } from "@/stores/useSidebarStore";
import { RAIL_GUTTER } from "@/lib/rail-width";
import {
  DEFAULT_SIDEBAR_WIDTH,
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_COLLAPSED_VERSION,
  SIDEBAR_KEYBOARD_STEP,
  SIDEBAR_KEYBOARD_STEP_LARGE,
  SIDEBAR_WIDTH_KEY,
  SIDEBAR_WIDTH_VERSION,
  clampSidebarWidth,
  parsePersistedSidebarWidth,
  resolveSidebarBounds,
  sidebarWidthFromDrag,
} from "@/lib/sidebar-width";

// Collapsed state and the expanded WIDTH both live in useSidebarStore now,
// persisted there on write. They were local component state, on the reasoning
// that "nothing outside this panel toggles it" — still true of writes, no
// longer true of reads: ChappiSidePanel has to know how much room this column
// is taking to compute its own maximum, and that answer depends on both
// values. Bounds, clamping and the storage validators are all in
// lib/sidebar-width.ts.
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

// Urganize's own social profiles (both @urganize), shown in the card's footer
// row (founder request, 2026-08-26). Buttons through openExternalUrl rather
// than target="_blank" anchors so they open the system browser inside the
// Capacitor shell — the same reasoning ShareLoginActions records. The marks
// come from react-icons/si, the exact set the content calendar's platform
// tabs already use, so the two surfaces can't drift on what X and Instagram
// look like.
const INSTAGRAM_URL = "https://instagram.com/urganize";
const X_URL = "https://x.com/urganize";

// Same flag TasksPanel's scene pill and MetadataSection read. At `lg`+ this
// card is the primary entry point ("Metadata" below); TasksPanel's
// own pill keeps a below-`lg` copy alive, since this card never renders on
// small viewports and dropping the pill there with no replacement would make
// Metadata unreachable on phones/tablets (2026-08-12).
const METADATA_ENABLED = process.env.NEXT_PUBLIC_FEATURE_METADATA === "true";

// The card's nav (URG-229). Same three global surfaces the topbar exposes,
// using the SAME hand-drawn marks (BrandIcons) so the two entry points read
// as one system. Active matching mirrors AppTopbar's — including, since
// 2026-08-31, its `isAtRest` treatment of the catalog: a scoped release no
// longer counts as being ON the catalog. See the Catalog item for why that
// reversed. Prefix matching for the others. Admin is appended separately
// below — it's visibility-gated.
type NavChild = {
  /** The release this row scopes to — also its key. */
  releaseId: string;
  label: string;
  /** Resolved in buildNavItems, which is the only place that holds the scoped
   *  id, so the list renderer stays free of useSearchParams (it doubles as the
   *  Suspense fallback, and reading params there would defeat the boundary). */
  isActive: boolean;
};

type NavItem = {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
  isActive: (pathname: string) => boolean;
  /** Rows nested under this one behind a chevron (founder call, 2026-08-31 —
   *  Catalog is the only item with any). Never rendered in the collapsed icon
   *  rail: a 64px column has no room for a second level, the same reason the
   *  Beta pill folds into the tooltip there. */
  children?: NavChild[];
  /** Side effect to run as the row is followed. Only Catalog sets one — see
   *  forgetScopedReleaseScene. */
  onNavigate?: () => void;
  /** Marks a surface that shipped flag-off and hasn't been used against a real
   *  team yet (founder call, 2026-08-31 — Shows is the first to carry this
   *  since the app-wide Beta cleanup on 2026-08-16; that cleanup dropped the
   *  stamp everywhere, it did not retire the pattern). Renders the same pill
   *  Press kit and Fan capture used to carry, folded into the collapsed
   *  state's tooltip since there's no room for it there. Sparing — most nav
   *  items should not set this. */
  beta?: boolean;
  /** The pullout explaining what this surface is for (founder ask, 2026-09-08,
   *  from a screenshot of Vercel's own side menu). A row's LABEL says what it is
   *  called and nothing says what it does, which is the gap this closes.
   *
   *  Hover only, and that costs nothing here: this whole card is
   *  `hidden lg:block`, so it never renders on a device without a pointer. The
   *  collapsed rail is the one place it does not show — there the native
   *  `title` is already carrying the label, which matters more than the
   *  explanation, and two popups on one row is worse than either alone. */
  help?: HelpKey;
};

// Same flag AppTopbar reads for its Notes icon — the two entry points appear
// and disappear together.
const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === "true";

// Shows. Same flag AppTopbar reads for its own entry point, so the two cannot
// disagree about whether the surface exists.
const EVENTS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EVENTS === "true";

const DIRECTORY_ENABLED = process.env.NEXT_PUBLIC_FEATURE_DIRECTORY === "true";

// Playlist pitching, which this card carries TWICE for one account and in two
// directions. The team row (/dashboard/pitching) is every pitch the team sent
// and is shown to every team account. The crossing at the base of the list
// (/curator) is the inbox for playlists the account owns, so it is shown only
// when the account actually holds a curator profile (auth store's
// hasCuratorProfile); the /curator shell enforces the same thing for anyone
// who types the URL.
//
// Press kits used to read this same file's own flag for a row here. It left
// the menus entirely on 2026-09-09 (founder call) and is reached from
// Settings alone; the pages did not move.
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === "true";

// NavItem.Icon must always return a ReactElement (matching the BrandIcons
// function components' signature); lucide-react's ForwardRefExoticComponent
// types its call signature as `ReactElement | null`, so it can't be assigned
// to that field directly — these thin wrappers close the gap.
function MetadataIcon({ className }: { className?: string }) {
  return <ClipboardList className={className} />;
}

// A handheld stage microphone, not a calendar (founder call, 2026-08-31: on
// desktop this row and the workspace's Content pill were showing the same
// glyph). `MicVocal` is the performer's mic rather than `Mic`'s podcast
// condenser, which is the right read for a live show. Note `Mic2` is only a
// deprecated alias of this same icon — do not reach for it.
function ShowsIcon({ className }: { className?: string }) {
  return <MicVocal className={className} aria-hidden="true" />;
}

// The same glyph the release Pitch pill uses, so the release scene and this
// row read as one feature. Deliberately NOT Inbox, which PitchesIcon below
// uses for the curator crossing — the two rows point in opposite directions
// and must not share a mark.
function PitchingIcon({ className }: { className?: string }) {
  return <Radio className={className} aria-hidden="true" />;
}

function DirectoryIcon({ className }: { className?: string }) {
  return <Users className={className} aria-hidden="true" />;
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
  help: "nav.admin",
};

const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  Icon: GearIcon,
  isActive: (pathname: string) => pathname.startsWith("/settings"),
  help: "nav.settings",
};

/**
 * Built per-render (not a module constant like the old NAV_ITEMS) because the
 * "Metadata" entry needs runtime state: it targets the release
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
  hasCuratorProfile: boolean,
  releases: { id: string; title: string }[]
): NavItem[] {
  return [
    // FIRST, above Catalog (founder call, 2026-09-09), and the same call that
    // made the assistant the post-auth landing again (lib/home-path.ts). The
    // row you land on is the row that leads the list.
    //
    // GATED ON ITS OWN FLAG, which this row was NOT before it moved. The
    // topbar has always gated its pair and this list never did, so with the
    // assistant off the list offered a row that bounces: ChappiPageClient
    // does `router.replace('/dashboard')` when the flag is off, which is the
    // same reason HOME_PATH is flag-conditional. Harmless while it sat third
    // among many; the wrong thing to leave at the top of the nav, where it is
    // the first thing a flag-off deployment offers.
    ...(CHAPPI_ENABLED
      ? [
          {
            href: "/dashboard/urgans",
            label: "UrgAns",
            Icon: ChappiIcon,
            isActive: (pathname: string) => pathname === "/dashboard/urgans",
            help: "nav.urgans" as const,
          },
        ]
      : []),
    {
      href: "/dashboard",
      label: "Catalog",
      Icon: CatalogIcon,
      // Only the BARE catalog counts (founder report, 2026-08-31: "catalog
      // doesn't open the catalog view once it's in a particular release").
      // This used to be a plain `pathname === "/dashboard"`, deliberately, so
      // that a scoped release still lit the row — the reasoning being that a
      // release is a view within the catalog. From the user's seat that reads
      // as "you are already here", which is the wrong thing to say about the
      // one control whose job is to get you OUT of a release. AppTopbar's
      // `isAtRest` has always drawn the line here; the two agree now.
      isActive: (pathname: string) => pathname === "/dashboard" && !scopedReleaseId,
      help: "nav.catalog",
      // Leaving a release forgets its scene, so tapping it again lands on
      // Activities rather than the thing you were getting out of — and records
      // that the catalog was asked for, so a single-release workspace does not
      // auto-scope this navigation away. Same family as the back arrow and
      // MobileNavBar's Home tab — see lib/catalog-intent.ts.
      onNavigate: leaveReleaseForCatalog,
      children: releases.map((release) => ({
        releaseId: release.id,
        label: release.title,
        isActive: release.id === scopedReleaseId,
      })),
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
            help: "nav.notes",
          } satisfies NavItem,
        ]
      : []),
    // Shows sit beside Notes as the other global surface: a release is not
    // involved, so this is not a release scene and never carries ?release=.
    // Prefix match rather than exact, because a show's own page lives one
    // level deeper and should keep the rail lit.
    ...(EVENTS_ENABLED
      ? [
          {
            href: "/dashboard/shows",
            label: "Shows",
            Icon: ShowsIcon,
            isActive: (pathname: string) => pathname.startsWith("/dashboard/shows"),
            help: "nav.shows",
            beta: true,
          } satisfies NavItem,
        ]
      : []),
    // Pitching — the TEAM side, in the slot Press kits held until 2026-09-09
    // (founder call: "Playlist pitching should be accessible app wide ... on
    // desktop on the side menu and top menu"). Before this the team side of
    // pitching existed only as a release scene, so it could not be reached
    // without scoping a release first.
    //
    // Distinct from Playlist pitches at the base of this list, which is the
    // other direction: the inbox for playlists this account owns.
    ...(PITCHING_ENABLED
      ? [
          {
            href: "/dashboard/pitching",
            label: "Pitching",
            Icon: PitchingIcon,
            isActive: (pathname: string) => pathname.startsWith("/dashboard/pitching"),
            help: "nav.pitching",
            beta: true,
          } satisfies NavItem,
        ]
      : []),
    // Beside Pitching, as the other standing surface that belongs to nobody's
    // release. Prefix match so a person's page keeps the row lit.
    //
    // DESKTOP ONLY, and that is a known gap rather than an oversight: a phone
    // reaches this through the search surface (lib/app-pages.ts carries the
    // keywords) until the role gaps panel gives it a better path in. The
    // mobile bar has room for one more tab (its own arithmetic says ~47px at
    // eight), but past that an overflow sheet is the honest answer.
    ...(DIRECTORY_ENABLED
      ? [
          {
            href: "/dashboard/directory",
            label: "Directory",
            Icon: DirectoryIcon,
            isActive: (pathname: string) => pathname.startsWith("/dashboard/directory"),
            help: "nav.directory",
            beta: true,
          } satisfies NavItem,
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
            label: "Metadata",
            Icon: MetadataIcon,
            isActive: (pathname: string) => pathname === "/dashboard" && activeScene === "metadata",
            help: "nav.metadata",
          } satisfies NavItem,
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
            help: "nav.pitches",
          } satisfies NavItem,
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
/** One line of muted text under the team name. Shared so the Suspense fallback
 *  and the resolved line cannot drift apart in size or colour. */
function ArtistLine({ label }: { label: string }) {
  if (!label) return null;
  return (
    <p className="mt-0.5 truncate text-xs text-content-secondary" title={label}>
      {label}
    </p>
  );
}

/**
 * Names the artist of whichever release you are looking at (founder call,
 * 2026-08-30). Before rosters this line was always the team's one artist, which
 * stops being a useful thing to say the moment a team has three.
 *
 * ISOLATED BEHIND ITS OWN SUSPENSE BOUNDARY, and that is not stylistic:
 * `useSearchParams` in a statically prerendered client component makes Next
 * bail out to the nearest boundary, and this card is mounted app-wide by
 * AppShell — including on `/settings`, which must stay `○ Static`. Contained
 * here, only this line waits. Do not lift the hook into the panel itself; that
 * un-prerenders every page the card appears on, which is the documented trap
 * `/auth` had to be dug out of.
 */
function ScopedArtistLine({ fallbackLabel }: { fallbackLabel: string }) {
  const searchParams = useSearchParams();
  const releases = useReleaseStore((state) => state.releases);
  const scopedId = searchParams.get("release");
  const scoped = scopedId ? releases.find((release) => release.id === scopedId) : null;
  return <ArtistLine label={scoped?.artistName?.trim() || fallbackLabel} />;
}

export function WorkspaceIdentityPanel() {
  const name = useWorkspaceIdentityStore((state) => state.name);
  const artist = useWorkspaceIdentityStore((state) => state.artist);
  const artistCount = useWorkspaceIdentityStore((state) => state.artistCount);
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
  const railWidth = useChappiStore((state) => state.railWidth);
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

  // Both start at their defaults so SSR and the initial client render agree;
  // the mount effect below then applies the stored choices. Same SSR-safe
  // hydration order AppShell uses for the UrgAns rail's own two values.
  const collapsed = useSidebarStore((state) => state.collapsed);
  const setCollapsed = useSidebarStore((state) => state.setCollapsed);
  const hydrateCollapsed = useSidebarStore((state) => state.hydrateCollapsed);
  const storedWidth = useSidebarStore((state) => state.width);
  const setWidth = useSidebarStore((state) => state.setWidth);
  const hydrateWidth = useSidebarStore((state) => state.hydrateWidth);

  useEffect(() => {
    const persistedCollapsed = readPersistedState(
      SIDEBAR_COLLAPSED_KEY,
      SIDEBAR_COLLAPSED_VERSION,
      isBoolean,
    );
    if (persistedCollapsed !== null) hydrateCollapsed(persistedCollapsed);
    const persistedWidth = readPersistedState(
      SIDEBAR_WIDTH_KEY,
      SIDEBAR_WIDTH_VERSION,
      (value): value is number => parsePersistedSidebarWidth(value) !== null,
    );
    if (persistedWidth !== null) hydrateWidth(persistedWidth);
  }, [hydrateCollapsed, hydrateWidth]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsed);
  }, [collapsed, setCollapsed]);

  const asideRef = useRef<HTMLElement | null>(null);
  const [dragging, setDragging] = useState(false);

  // Measured rather than assumed, and re-measured on resize: a width sized on
  // a big monitor must not survive onto a laptop, and browser zoom, OS display
  // scaling and a rotating tablet all arrive through this same event. Same
  // measurement ChappiSidePanel takes, including using
  // documentElement.clientWidth rather than innerWidth — this repo has already
  // been burned measuring the wrong one, and innerWidth counts a classic
  // scrollbar that is not layout space.
  const [viewport, setViewport] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      setViewport(document.documentElement.clientWidth);
    };
    measure();
    const onResize = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // What the rail is taking out of the row right now — 0 whenever it is not on
  // screen, which railIsCompeting above already answers exactly (flag off,
  // closed, or the assistant page where the rail renders nowhere).
  //
  // The store's raw railWidth is used rather than the rail's own clamped one.
  // They converge on the next frame (the rail writes its clamp back), and while
  // they disagree this OVER-reserves, which is the safe direction: it makes our
  // maximum smaller, never main's floor thinner. Every clamp on either side
  // only ever shrinks, so the two columns settle instead of oscillating.
  const railTotal = railIsCompeting ? railWidth + RAIL_GUTTER : 0;
  const bounds = resolveSidebarBounds(viewport, railTotal);
  // UNTIL THE VIEWPORT HAS BEEN MEASURED, the stored width renders unclamped.
  // A viewport of 0 is "not known yet", not "too small", and the locked
  // fallback's max is the MINIMUM — so clamping against it would paint the card
  // at 208px and then jump to 240 as soon as the measure effect lands. The rail
  // never had to deal with this because it is closed on first paint; this card
  // is visible immediately. The handle is withheld either way (bounds.resizable
  // is false while unmeasured), so there is nothing to drag against a bound we
  // have not worked out.
  const width = viewport > 0 ? clampSidebarWidth(storedWidth, bounds) : storedWidth;

  // A width the current viewport cannot pay for is corrected in state too, not
  // just on screen — otherwise the next drag would start from a number nothing
  // on the page agrees with. Skipped while collapsed: the card is 64px then, so
  // the stored expanded width is not on screen and must not be rewritten by a
  // bound it is not currently subject to.
  useEffect(() => {
    if (viewport > 0 && !collapsed && width !== storedWidth) setWidth(width);
  }, [viewport, collapsed, width, storedWidth, setWidth]);

  const commit = useCallback(
    (next: number) => setWidth(clampSidebarWidth(next, bounds)),
    [bounds, setWidth],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Left button only. A right or middle click here is not a resize, and a
      // second finger arriving mid-drag must not hijack the first.
      if (event.button !== 0 || !bounds.resizable) return;
      event.preventDefault();

      const handle = event.currentTarget;
      const startX = event.clientX;
      const startWidth = width;
      const pointerId = event.pointerId;
      handle.setPointerCapture(pointerId);
      setDragging(true);

      // The drag writes a CSS variable, not React state: at 120Hz this is one
      // style write per frame instead of one render per frame. State is set
      // once, on release.
      let frame = 0;
      let latest = startWidth;

      const paint = () => {
        frame = 0;
        asideRef.current?.style.setProperty("--urganize-sidebar-width", `${latest}px`);
      };

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        // Bounds are recomputed per move so a window resized mid-drag cannot
        // strand the card outside them.
        latest = sidebarWidthFromDrag(
          startWidth,
          startX,
          moveEvent.clientX,
          resolveSidebarBounds(document.documentElement.clientWidth, railTotal),
        );
        if (!frame) frame = window.requestAnimationFrame(paint);
      };

      const finish = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        if (frame) window.cancelAnimationFrame(frame);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", finish);
        // A cancelled drag COMMITS what the user last saw rather than snapping
        // back: the pointer was taken by the OS, not by them.
        handle.removeEventListener("pointercancel", finish);
        try {
          handle.releasePointerCapture(pointerId);
        } catch {
          // Already released, or the element is going away. Nothing to undo.
        }
        asideRef.current?.style.removeProperty("--urganize-sidebar-width");
        setDragging(false);
        commit(latest);
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    },
    [bounds.resizable, commit, railTotal, width],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!bounds.resizable) return;
      const step = event.shiftKey ? SIDEBAR_KEYBOARD_STEP_LARGE : SIDEBAR_KEYBOARD_STEP;
      // Right widens, matching the drag direction exactly — and therefore the
      // opposite way round from the rail's handle on the other edge.
      if (event.key === "ArrowRight") commit(width + step);
      else if (event.key === "ArrowLeft") commit(width - step);
      else if (event.key === "Home") commit(bounds.max);
      else if (event.key === "End") commit(bounds.min);
      else if (event.key === "Enter" || event.key === " ") commit(DEFAULT_SIDEBAR_WIDTH);
      else return;
      // Only once we know it was ours: Escape and Tab still belong to the page.
      event.preventDefault();
    },
    [bounds, commit, width],
  );

  // Cursor and selection are set on <body> for the whole drag, so neither
  // flickers as the pointer crosses other elements.
  useEffect(() => {
    if (!dragging) return;
    const { style } = document.body;
    const previousCursor = style.cursor;
    const previousSelect = style.userSelect;
    style.cursor = "col-resize";
    style.userSelect = "none";
    return () => {
      style.cursor = previousCursor;
      style.userSelect = previousSelect;
    };
  }, [dragging]);

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

  // What this line says when no release is scoped. One artist keeps naming
  // them, which is what this card has always done; several says how many,
  // because naming just the first would read as "the team's artist".
  const rosterLabel =
    artistCount > 1 ? `${artistCount} artists` : (artist?.name ?? "");

  const showSkeleton = !hydrated;

  return (
    <aside
      // Named for what a screen reader should hear, which is not what this
      // component is called (2026-09-09 positioning: never "workspace" in
      // anything a person reads). Single-word strings are invisible to
      // lib/copy-scan.ts by design, so this one was found by reading.
      aria-label="Your team"
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
      ref={asideRef}
      // NO `relative` here, deliberately: `sticky` is already a positioned
      // ancestor, so the drag handle below anchors to this element as it is.
      // Adding both would leave which one applies up to Tailwind's utility
      // ordering rather than to us, and losing `sticky` un-pins the whole card.
      className={`hidden shrink-0 self-start sticky top-[calc(5.25rem+1px)] ml-8 mr-8 h-[calc(100dvh-7.75rem-1px)] min-h-[24rem] ${
        // The transition is REMOVED while dragging. It animates `width`, so
        // every frame of a drag would lag behind the cursor — the single most
        // likely way for this to look broken.
        dragging ? "" : "transition-[width] duration-base ease-out"
      } ${
        // Collapsed keeps its fixed `w-16`; expanded takes its width from the
        // custom property below, which is also what the drag writes to.
        collapsed ? "w-16" : ""
      } ${railIsCompeting && !collapsed ? "xl:block" : "lg:block"}`}
      style={
        {
          "--urganize-sidebar-width": `${width}px`,
          ...(collapsed ? null : { width: "var(--urganize-sidebar-width)" }),
        } as React.CSSProperties
      }
    >
      {/* The drag handle sits on the card's RIGHT edge, so dragging toward the
          centre of the screen widens it — the mirror of the UrgAns rail, whose
          handle is on its left edge for the same reason. A 2px visible hairline
          inside a wider hit area; withheld entirely while collapsed (64px has
          nothing to grow into) or when the viewport cannot pay for any
          movement, because a control that cannot move is worse than none. */}
      {!collapsed && bounds.resizable ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize workspace menu"
          aria-valuenow={width}
          aria-valuemin={bounds.min}
          aria-valuemax={bounds.max}
          tabIndex={0}
          draggable={false}
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
          onDoubleClick={() => commit(DEFAULT_SIDEBAR_WIDTH)}
          className="motion-focus group absolute right-0 top-0 z-10 h-full w-3 cursor-col-resize touch-none select-none"
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 right-1 w-0.5 rounded-full transition-colors ${
              dragging
                ? "bg-brand"
                : "bg-transparent group-hover:bg-brand/50 group-focus-visible:bg-brand"
            }`}
          />
        </div>
      ) : null}

      <div className="flex h-full flex-col overflow-hidden urg-cartouche rounded-2xl border border-stroke-default bg-bg-surface">
        <Link
          href="/settings"
          title={collapsed ? name || "Your team" : undefined}
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
              <span className="sr-only">{name || "Your team"}</span>
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
                {name || "Your team"}
              </p>
              <Suspense fallback={<ArtistLine label={rosterLabel} />}>
                <ScopedArtistLine fallbackLabel={rosterLabel} />
              </Suspense>

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
          aria-label="Main navigation"
          className="flex min-h-0 flex-1 flex-col border-t border-stroke-subtle p-2"
        >
          {/* WorkspaceNavLinks needs useSearchParams (to find the currently
            scoped release for "Metadata"), and this panel is mounted
            from layout-level chrome (AppShell) rather than a page — same
            reason AppTopbar's ContextTitle/CatalogTopbarAction/ChappiTopbarAction
            each get their own Suspense boundary. Fallback renders the nav
            without the release-dependent item (equivalent to no release being
            scoped yet), never a spinner, so the rest of the nav never blocks
            on it. */}
          <Suspense
            fallback={
              <WorkspaceNavList
                navItems={buildNavItems(null, null, hasCuratorProfile === true, releases)}
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
              releases={releases}
            />
          </Suspense>
        </nav>

        {/* Footer row, pinned to the base of the card (founder call,
          2026-08-12): Urganize's social links on the left (founder request,
          2026-08-26), the collapse control on the right. The nav above it is
          `flex-1`, so this row needs no positioning of its own — it simply
          takes the space left over at the bottom. It is a sibling of the
          identity <Link> rather than a child: a <button> cannot nest inside
          an <a>. The socials hide when collapsed (the 64px rail has room for
          one control, and they're brand chrome, not navigation), which keeps
          the collapsed layout exactly what it was: the centered collapse
          button alone. */}
        <div
          className={`flex shrink-0 items-center border-t border-stroke-subtle p-2 ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          {!collapsed && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void openExternalUrl(INSTAGRAM_URL)}
                aria-label="Urganize on Instagram"
                title="@urganize on Instagram"
                className="motion-focus motion-press grid h-8 w-8 shrink-0 place-items-center rounded-lg text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
              >
                <SiInstagram className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => void openExternalUrl(X_URL)}
                aria-label="Urganize on X"
                title="@urganize on X"
                className="motion-focus motion-press grid h-8 w-8 shrink-0 place-items-center rounded-lg text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
              >
                <SiX className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand the menu" : "Collapse the menu"}
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
  releases,
}: {
  pathname: string | null;
  isAdmin: boolean;
  collapsed: boolean;
  hasCuratorProfile: boolean;
  releases: { id: string; title: string }[];
}) {
  const searchParams = useSearchParams();
  // Same `?release=` / `?scene=` params useReleaseScope / useSceneOverlay own
  // — read directly here (not via those hooks) since this component only
  // needs them to build one nav href, not to read or write scene state.
  const scopedReleaseId = searchParams.get("release");
  const activeScene = searchParams.get("scene");
  const navItems = buildNavItems(scopedReleaseId, activeScene, hasCuratorProfile, releases);
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

/** Plain render of the nav rows — reads NO search params, which is what lets it
 * double as the Suspense fallback (called directly with a release-less item
 * list) as well as the resolved output (via WorkspaceNavLinks above). It does
 * hold one piece of local state for the expanded sub-list, which is fine in a
 * fallback; what must never appear here is useSearchParams, since that is the
 * bailout this boundary exists to contain. Renders the scrolling list of
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
  // Which row's sub-list is open, by href — at most one at a time, and shut on
  // arrival. Deliberately NOT persisted and not auto-opened for the scoped
  // release: the founder asked for an arrow you open, and a nav that expands
  // itself on every load buries Settings below a roster on a short viewport.
  const [expandedHref, setExpandedHref] = useState<string | null>(null);
  // ONE panel for the whole list, not one per row. Only a single tip is ever
  // visible, and the rows are built by the `renderRow` closure below inside a
  // `.map`, where a per-row hook would break the rules of hooks. So the rows
  // report which one they are pointing at and this component owns the panel.
  const [activeHelp, setActiveHelp] = useState<{ key: HelpKey; el: HTMLElement } | null>(null);
  const helpPanelId = useId();
  const renderRow = ({ href, label, Icon, isActive, beta, children, onNavigate, help }: NavItem) => {
    const active = isActive(pathname || "");
    // Collapsed has no room for a visible pill (icon-only), so the signal
    // folds into the same text that already stands in for the label there —
    // the tooltip and the sr-only span, both one string, so neither can drift
    // from the other the way a separate aria-label would.
    const collapsedLabel = beta ? `${label} (Beta)` : label;
    // A 64px icon rail cannot show a second level, so the collapsed card drops
    // the whole sub-list rather than shrinking it — same call the Beta pill
    // makes. Nothing is lost: the row still navigates to the catalog.
    const subItems = collapsed ? [] : (children ?? []);
    const expanded = expandedHref === href;
    const subListId = `workspace-nav-sub-${href.replace(/[^a-zA-Z0-9]+/g, "-")}`;

    // Only while expanded: the collapsed rail's native `title` is already
    // carrying the label there, and two popups on one row is worse than either
    // alone. Focus as well as hover, since this card is keyboard-reachable and
    // desktop-only.
    const helpHandlers =
      help && !collapsed
        ? {
            "aria-describedby": activeHelp?.key === help ? helpPanelId : undefined,
            onPointerEnter: (event: React.PointerEvent<HTMLAnchorElement>) =>
              setActiveHelp({ key: help, el: event.currentTarget }),
            onPointerLeave: () => setActiveHelp(null),
            onFocus: (event: React.FocusEvent<HTMLAnchorElement>) =>
              setActiveHelp({ key: help, el: event.currentTarget }),
            onBlur: () => setActiveHelp(null),
          }
        : {};

    const link = (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        title={collapsed ? collapsedLabel : undefined}
        {...helpHandlers}
        className={`${navRowClass(active, collapsed)}${subItems.length > 0 ? " min-w-0 flex-1" : ""}`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className={collapsed ? "sr-only" : "truncate"}>
          {collapsed ? collapsedLabel : label}
        </span>
        {beta && !collapsed ? (
          <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
            Beta
          </span>
        ) : null}
      </Link>
    );

    // Every row without children renders exactly what it always did — the
    // wrapper below is Catalog's alone, so this change cannot move any other
    // row by a pixel.
    if (subItems.length === 0) return link;

    return (
      <div key={href}>
        <div className="flex items-center gap-1">
          {link}
          {/* A sibling of the link, never inside it: a <button> cannot nest in
              an <a>, the same constraint the footer's collapse control and the
              identity block already work around. Rotation matches TasksPanel's
              activity buckets (-rotate-90 when shut) so the two collapsibles
              in this app read the same way. */}
          <button
            type="button"
            onClick={() => setExpandedHref(expanded ? null : href)}
            aria-expanded={expanded}
            aria-controls={subListId}
            aria-label={expanded ? `Hide ${label.toLowerCase()} list` : `Show ${label.toLowerCase()} list`}
            title={expanded ? "Hide releases" : "Show releases"}
            className="motion-focus motion-press grid h-8 w-8 shrink-0 place-items-center rounded-lg text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expanded ? "" : "-rotate-90"}`}
              aria-hidden="true"
            />
          </button>
        </div>
        {expanded ? (
          <ul id={subListId} className="mb-0.5 ml-4 border-l border-stroke-subtle pl-2">
            {subItems.map((child) => (
              <li key={child.releaseId}>
                <Link
                  href={`/dashboard?release=${child.releaseId}`}
                  aria-current={child.isActive ? "page" : undefined}
                  // The full name, since the visible one is truncated to the
                  // card's width, whatever it has been dragged to.
                  title={child.label}
                  className={`motion-focus mb-0.5 block truncate rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                    child.isActive
                      ? "bg-brand/10 text-brand"
                      : "text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                  }`}
                >
                  {child.label || "Untitled release"}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
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

      {/* Portals to the body, so it renders nothing here and this fragment
        stays transparent for the flex arrangement above. `prefer="right"` puts
        it beside the card, which is the shape the founder's reference
        screenshot shows. */}
      {activeHelp ? (
        <HelpTipPanel
          helpKey={activeHelp.key}
          anchor={activeHelp.el}
          prefer="right"
          id={helpPanelId}
        />
      ) : null}
    </>
  );
}
