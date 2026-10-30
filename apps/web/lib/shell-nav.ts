// The app's navigation, as data (design overhaul, 2026-10-04).
//
// One top bar of areas (Artists, UrgAns, Team since 2026-10-29, #876: Home left; the
// floating button stays as its door on other screens), a second row of tabs for the area you are
// in, and a bottom bar on a phone. Everything the desktop top bar, the sub-tab
// row, the phone's bottom bar and its "More" sheet show comes from here, so they
// cannot disagree about what exists, what it is called or where it goes.
//
// Pure on purpose: the feature flags arrive as an argument, so the tests drive
// both states without stubbing the environment, and `readShellFlags` below is the
// only place that reads them.

import { TEAM_HREF } from './team-page';
import { isOpportunitiesEnabled, isRelationshipsFlagOn } from './paused-features';
import { artistIdFromPath } from './artist-page';

export type ShellAreaKey =
  | 'urgans'
  | 'catalogue'
  | 'team'
  | 'relationships'
  | 'opportunities'
  | 'audience'
  // The role-view "More" group (URG-260, lib/role-views.ts). Never built here;
  // applyRoleView appends it when a view tucks something.
  | 'more';

export type ShellFlags = {
  notes: boolean;
  pitching: boolean;
  directory: boolean;
  artistPage: boolean;
  relationships: boolean;
  pressKits: boolean;
  /** Paused Oct 27, 2026 (lib/paused-features.ts): off unless its env var is set. */
  opportunities: boolean;
};

/** A tab's one action, drawn at the right end of the phone tab row (tab jump
 *  fix, Oyin approved the mocks Oct 18, 2026). It is data, so SubNav draws it
 *  in the first frame instead of a page portalling a button in after paint.
 *  `href` is a link; `press` names a shell command SubNav knows how to run.
 *  null keeps the slot's space with no button, so the row never changes shape
 *  between tabs. */
export type ShellSubTabAction =
  | { label: string; href: string; press?: never }
  | { label: string; press: 'openCreate' | 'addArtist'; href?: never };

export type ShellSubTab = {
  key: string;
  label: string;
  href: string;
  /** True when this tab is the one on screen for the given location. */
  isActive: (pathname: string) => boolean;
  /** The tab's action at the row's right end. null or absent keeps the slot
   *  empty (its space stays). */
  action?: ShellSubTabAction | null;
};

export type ShellArea = {
  key: ShellAreaKey;
  label: string;
  /** Where the pill goes: the area's first tab, or its coming-soon page. */
  href: string;
  /** False for an area that has nothing built yet: it still has a pill, and its
   *  page says so (see ComingSoon). */
  live: boolean;
  subTabs: ShellSubTab[];
  isActive: (pathname: string) => boolean;
};

const startsWithPath = (pathname: string, base: string): boolean =>
  pathname === base || pathname.startsWith(`${base}/`);

/** Reads the same NEXT_PUBLIC_FEATURE_* gates the pages themselves use, so a
 *  destination is offered exactly when its page will open. Inlined at build time. */
export function readShellFlags(): ShellFlags {
  return {
    notes: process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true',
    pitching: process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true',
    directory: process.env.NEXT_PUBLIC_FEATURE_DIRECTORY === 'true',
    artistPage:
      process.env.NEXT_PUBLIC_FEATURE_ARTIST_PAGE === 'true' &&
      process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true',
    relationships:
      isRelationshipsFlagOn() &&
      process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true',
    pressKits: process.env.NEXT_PUBLIC_FEATURE_PRESS_KITS === 'true',
    opportunities: isOpportunitiesEnabled(),
  };
}

/** Home left the menu (founder, 2026-10-29, #876). Its old address now opens
 *  Artists, so anything still pointing here lands where the menu starts. */
export const HOME_HREF = '/dashboard';
export const URGANS_HREF = '/dashboard/urgans';
/** /dashboard with ?release=<id> is a rollout. Without it, it was the Rollouts
 *  list until Oct 30, 2026, and is now the artist list (founder: "disable
 *  rollouts", each rollout opens from its artist's page). */
export const CATALOGUE_HREF = '/dashboard';
export const DISTRIBUTE_HREF = '/dashboard/distribute';
/** The artist list, Home's one page, at /dashboard since Oct 30, 2026 (it was
 *  /dashboard/artists, which still shows the list for old Android apps). */
export const ARTISTS_HREF = '/dashboard';
/** The Team tab (issue #853, 2026-10-29): who is on the team, when they were
 *  last in, their tasks, and the workspace's settings. */
export { TEAM_HREF };
/** The nav word for the 'catalogue' area (Catalogue until 2026-10-17, then
 * Artist; Artists, plural to match the tab, since later that day; Home since
 * 2026-10-30, #886, founder: "change the label from Artist to Home"). The
 * Artists tab inside the section keeps its name. */
export const CATALOGUE_LABEL = 'Home';

export function buildShellAreas(flags: ShellFlags): ShellArea[] {
  // Artists is the section's landing (founder call, 2026-10-17). Since Oct 30,
  // 2026 it is the only tab, so visibleSubTabs draws no tab row at all.
  const catalogueTabs: ShellSubTab[] = [];
  if (flags.artistPage) {
    catalogueTabs.push({
      key: 'artists',
      label: 'Artists',
      href: ARTISTS_HREF,
      isActive: (p) => p === ARTISTS_HREF || startsWithPath(p, '/dashboard/artists') || artistIdFromPath(p) !== null,
      action: { label: 'Add artist', press: 'addArtist' },
    });
  } else {
    // The Rollouts list was turned off on Oct 30, 2026 (founder): Home is the
    // artist list alone, with no tab row, and a rollout opens from its artist's
    // page. It stays only for a build without the artist page, where it is
    // the one list there is.
    catalogueTabs.push({
      key: 'releases',
      label: 'Rollouts',
      href: CATALOGUE_HREF,
      isActive: (p) => p === '/dashboard' || startsWithPath(p, '/dashboard/releases'),
      action: { label: 'New rollout', press: 'openCreate' },
    });
  }
  // Distribute left the tab row (founder call, 2026-10-15): it is reached from
  // inside each rollout (its Distribute scene). /dashboard/distribute still
  // lights Catalogue, so an old link lands somewhere that makes sense.
  if (flags.notes) {
    catalogueTabs.push({
      key: 'notes',
      label: 'Notes',
      href: '/dashboard/notes',
      isActive: (p) => startsWithPath(p, '/dashboard/notes'),
      // Keeps the slot's space, no button: the row stays one shape.
      action: null,
    });
  }

  // Directory first and the pill's landing, then My People (URG-303, founder
  // 2026-10-15). Shows left Relationships the same day: open gig calls sit in
  // Opportunities, booked shows on each artist's page under Catalogue.
  const relationshipTabs: ShellSubTab[] = [];
  if (flags.directory) {
    relationshipTabs.push({
      key: 'directory',
      label: 'Directory',
      href: '/dashboard/directory',
      isActive: (p) => startsWithPath(p, '/dashboard/directory'),
      action: null,
    });
  }
  if (flags.relationships) {
    relationshipTabs.push({
      key: 'people',
      label: 'My People',
      href: '/dashboard/relationships',
      isActive: (p) => startsWithPath(p, '/dashboard/relationships'),
      action: null,
    });
  }

  // Artists, UrgAns, Team (founder, 2026-10-29, #876): Home left the menu.
  return [
    {
      // Labelled Home since 2026-10-30 (Artists from 2026-10-17); the key stays
      // 'catalogue' so stored state, tours and analytics keep their names.
      key: 'catalogue',
      label: CATALOGUE_LABEL,
      href: catalogueTabs[0].href,
      live: true,
      subTabs: catalogueTabs,
      isActive: (p) =>
        p === '/dashboard' ||
        startsWithPath(p, '/dashboard/releases') ||
        startsWithPath(p, '/dashboard/artists') ||
        artistIdFromPath(p) !== null ||
        startsWithPath(p, DISTRIBUTE_HREF) ||
        startsWithPath(p, '/dashboard/notes'),
    },
    // The pill opens the assistant's own page, which on a desktop is the
    // sessions view (UrgansSessionsLayout).
    {
      key: 'urgans',
      label: 'Assistant',
      href: URGANS_HREF,
      live: true,
      subTabs: [],
      isActive: (p) => startsWithPath(p, URGANS_HREF),
    },
    {
      key: 'team',
      label: 'Team',
      href: TEAM_HREF,
      live: true,
      subTabs: [],
      isActive: (p) => startsWithPath(p, TEAM_HREF),
    },
    // Pitching left the top bar and the phone's bottom bar (founder,
    // 2026-10-15): it lives fully inside each rollout, as its Pitch tab.
    // Relationships is parked with My People (founder, 2026-10-29, #853): the
    // whole area, Directory included, comes back when My People is unpaused
    // (lib/paused-features.ts). The Directory page itself still opens from
    // search and from its links.
    ...(flags.relationships
      ? [
          {
            key: 'relationships' as const,
            label: 'Relationships',
            href: relationshipTabs[0]?.href ?? '/dashboard/directory',
            live: relationshipTabs.length > 0,
            subTabs: relationshipTabs,
            isActive: (p: string) =>
              startsWithPath(p, '/dashboard/relationships') || startsWithPath(p, '/dashboard/directory'),
          },
        ]
      : []),
    // Opportunities is paused (Oct 27, 2026): no pill, no More row, no G O.
    ...(flags.opportunities
      ? [
          {
            key: 'opportunities' as const,
            label: 'Opportunities',
            href: '/dashboard/opportunities',
            live: true,
            subTabs: [],
            isActive: (p: string) => startsWithPath(p, '/dashboard/opportunities'),
          },
        ]
      : []),
    // Audience left the nav (Oct 16, 2026 cuts, URG-319): a top-bar pill that
    // only said "Coming soon". It comes back when it exists. /dashboard/audience
    // forwards to Artists.
  ];
}

/** The area on screen, or null on a page that belongs to none (UrgAns' own page,
 *  credits, settings). */
export function activeShellArea(areas: ShellArea[], pathname: string): ShellArea | null {
  return areas.find((area) => area.isActive(pathname)) ?? null;
}

/** The sub-tab row is only worth a line of screen when there is a choice. */
export function visibleSubTabs(area: ShellArea | null): ShellSubTab[] {
  if (!area || area.subTabs.length < 2) return [];
  return area.subTabs;
}

export type MobileTab = { key: string; label: string; href: string; area: ShellAreaKey };

/** The phone's bottom bar. UrgAns is a tab here (the full page) because a
 *  drawer on a phone is a full page anyway, and it is the one thing a thumb
 *  should always reach. */
export function buildMobileTabs(areas?: ShellArea[]): MobileTab[] {
  // Team goes to the bar (founder, 2026-10-29, #876) unless a role view tucked
  // it into More.
  // The Artists tab goes where its area's pill goes (Artists, or Rollouts when
  // the artist page is off or a role view tucks it).
  const catalogueHref = areas?.find((area) => area.key === 'catalogue')?.href ?? CATALOGUE_HREF;
  const tabs: MobileTab[] = [
    { key: 'catalogue', label: CATALOGUE_LABEL, href: catalogueHref, area: 'catalogue' },
    { key: 'urgans', label: 'Assistant', href: URGANS_HREF, area: 'urgans' },
  ];
  if (!areas || areas.some((area) => area.key === 'team')) {
    tabs.push({ key: 'team', label: 'Team', href: TEAM_HREF, area: 'team' });
  }
  return tabs;
}

/** Everything the bottom bar's tabs do not carry. */
export function buildMoreItems(
  areas: ShellArea[]
): Array<{ key: string; label: string; href: string; soon: boolean }> {
  const keep: ShellAreaKey[] = ['relationships', 'opportunities'];
  return areas
    .filter((area) => keep.includes(area.key))
    .map((area) => ({ key: area.key, label: area.label, href: area.href, soon: !area.live }));
}

/** Which bottom-bar tab is lit. More lights for any area it holds. */
export function activeMobileTab(areas: ShellArea[], pathname: string): string {
  if (startsWithPath(pathname, URGANS_HREF)) return 'urgans';
  const area = activeShellArea(areas, pathname);
  if (!area) return 'more';
  if (area.key === 'catalogue' || area.key === 'team') return area.key;
  return 'more';
}

export type SideMenuPage = ShellSubTab & { active: boolean };

export type SideMenu = {
  /** The area on screen, whose pages these are. */
  area: ShellArea;
  /** Its pages, in shell-nav order, the one on screen lit. */
  pages: SideMenuPage[];
};

/** The desktop side menu (URG-254; founder call 2026-10-14): the areas stay
 *  across the top, and the side menu lists the open area's pages as parent
 *  rows (a rollout's own menu nests under Rollouts, drawn by the rollout
 *  screen). Null, and so no side menu at all, on a page in no area and in an
 *  area with a single page. Catalogue always gets one, even with Rollouts as
 *  its only page, because an open rollout's menu lives under that row. */
export function shellSideMenu(areas: ShellArea[], pathname: string): SideMenu | null {
  const area = activeShellArea(areas, pathname);
  if (!area) return null;
  const tabs = visibleSubTabs(area);
  const pages = (tabs.length > 0 ? tabs : area.key === 'catalogue' ? area.subTabs : []).map((tab) => ({
    ...tab,
    active: tab.isActive(pathname),
  }));
  if (pages.length === 0) return null;
  // Catalogue kept its one-row menu when Rollouts was its only page. Artists
  // alone is Home, which shows no menu and no title (Oct 30, 2026, founder:
  // "remove the title artist").
  if (pages.length === 1 && !(area.key === 'catalogue' && pages[0].key === 'releases')) return null;
  return { area, pages };
}

/** The desktop page bar's title: the page on screen (the lit side-menu row,
 *  or the area itself when it has one page). Null on a page in no area. */
export function shellPageTitle(areas: ShellArea[], pathname: string): string | null {
  const area = activeShellArea(areas, pathname);
  if (!area) return null;
  // Every tab, not just the visible row: an area down to one page (Catalogue
  // with Rollouts alone, since Distribute left the row) still names it.
  const tab = area.subTabs.find((candidate) => candidate.isActive(pathname));
  return tab?.label ?? area.label;
}
