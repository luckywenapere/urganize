// The app's navigation, as data (design overhaul, 2026-10-04).
//
// One top bar of areas (UrgAns got its own pill after Home on 2026-10-15; the
// floating button stays as its door on other screens), a second row of tabs for the area you are
// in, and a bottom bar on a phone. Everything the desktop top bar, the sub-tab
// row, the phone's bottom bar and its "More" sheet show comes from here, so they
// cannot disagree about what exists, what it is called or where it goes.
//
// Pure on purpose: the feature flags arrive as an argument, so the tests drive
// both states without stubbing the environment, and `readShellFlags` below is the
// only place that reads them.

export type ShellAreaKey =
  | 'home'
  | 'urgans'
  | 'catalogue'
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
};

export type ShellSubTab = {
  key: string;
  label: string;
  href: string;
  /** True when this tab is the one on screen for the given location. */
  isActive: (pathname: string) => boolean;
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
      process.env.NEXT_PUBLIC_FEATURE_RELATIONSHIPS === 'true' &&
      process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true',
    pressKits: process.env.NEXT_PUBLIC_FEATURE_PRESS_KITS === 'true',
  };
}

export const HOME_HREF = '/dashboard/home';
export const URGANS_HREF = '/dashboard/urgans';
export const CATALOGUE_HREF = '/dashboard';
export const DISTRIBUTE_HREF = '/dashboard/distribute';
export const ARTISTS_HREF = '/dashboard/artists';
/** The nav word for the 'catalogue' area (Catalogue until 2026-10-17). */
export const CATALOGUE_LABEL = 'Artist';

export function buildShellAreas(flags: ShellFlags): ShellArea[] {
  // Artists first and the section's landing, Rollouts second (founder call,
  // 2026-10-17: "change the title from Catalogue to Artist then make the artist
  // page be the first on the list of menu and first to load"). The routes did
  // not move: /dashboard is still Rollouts, so every rollout link keeps working.
  const catalogueTabs: ShellSubTab[] = [];
  if (flags.artistPage) {
    catalogueTabs.push({
      key: 'artists',
      label: 'Artists',
      href: ARTISTS_HREF,
      isActive: (p) => startsWithPath(p, ARTISTS_HREF),
    });
  }
  catalogueTabs.push({
    key: 'releases',
    label: 'Rollouts',
    href: CATALOGUE_HREF,
    isActive: (p) => p === '/dashboard' || startsWithPath(p, '/dashboard/releases'),
  });
  // Distribute left the tab row (founder call, 2026-10-15): it is reached from
  // inside each rollout (its Distribute scene). /dashboard/distribute still
  // lights Catalogue, so an old link lands somewhere that makes sense.
  if (flags.notes) {
    catalogueTabs.push({
      key: 'notes',
      label: 'Notes',
      href: '/dashboard/notes',
      isActive: (p) => startsWithPath(p, '/dashboard/notes'),
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
    });
  }
  if (flags.relationships) {
    relationshipTabs.push({
      key: 'people',
      label: 'My People',
      href: '/dashboard/relationships',
      isActive: (p) => startsWithPath(p, '/dashboard/relationships'),
    });
  }

  return [
    {
      key: 'home',
      label: 'Home',
      href: HOME_HREF,
      live: true,
      subTabs: [],
      isActive: (p) => startsWithPath(p, HOME_HREF),
    },
    // UrgAns sits right after Home on the desktop top bar (founder, 2026-10-15).
    // On a desktop the pill opens Home's chat full width (TopNav), the same view
    // pressing Home again on Home gives, and lights while that view is up. Its
    // href is the assistant's own page, for a new tab or a direct link.
    {
      key: 'urgans',
      label: 'UrgAns',
      href: URGANS_HREF,
      live: true,
      subTabs: [],
      isActive: (p) => startsWithPath(p, URGANS_HREF),
    },
    {
      // Labelled Artist since 2026-10-17 (founder's word); the key stays
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
        startsWithPath(p, '/dashboard/press-kits') ||
        startsWithPath(p, DISTRIBUTE_HREF) ||
        startsWithPath(p, '/dashboard/notes'),
    },
    // Pitching left the top bar and the phone's bottom bar (founder,
    // 2026-10-15): it lives fully inside each rollout, as its Pitch tab.
    {
      key: 'relationships',
      label: 'Relationships',
      href: relationshipTabs[0]?.href ?? '/dashboard/directory',
      live: relationshipTabs.length > 0,
      subTabs: relationshipTabs,
      isActive: (p) =>
        startsWithPath(p, '/dashboard/relationships') || startsWithPath(p, '/dashboard/directory'),
    },
    {
      key: 'opportunities',
      label: 'Opportunities',
      href: '/dashboard/opportunities',
      live: true,
      subTabs: [],
      isActive: (p) => startsWithPath(p, '/dashboard/opportunities'),
    },
    // Audience left the nav (Oct 16, 2026 cuts, URG-319): a top-bar pill that
    // only said "Coming soon". It comes back when it exists. /dashboard/audience
    // forwards to Home.
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

export type MobileTab = { key: string; label: string; href: string; area: ShellAreaKey | 'urgans' };

/** The phone's bottom bar. UrgAns is a tab here (the full page) because a
 *  drawer on a phone is a full page anyway, and it is the one thing a thumb
 *  should always reach. */
export function buildMobileTabs(areas?: ShellArea[]): MobileTab[] {
  // The Artist tab goes where its area's pill goes (Artists, or Rollouts when
  // the artist page is off or a role view tucks it).
  const catalogueHref = areas?.find((area) => area.key === 'catalogue')?.href ?? CATALOGUE_HREF;
  return [
    { key: 'home', label: 'Home', href: HOME_HREF, area: 'home' },
    { key: 'catalogue', label: CATALOGUE_LABEL, href: catalogueHref, area: 'catalogue' },
    { key: 'urgans', label: 'UrgAns', href: '/dashboard/urgans', area: 'urgans' },
  ];
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
  if (area.key === 'home' || area.key === 'catalogue') return area.key;
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
  if (pages.length === 1 && area.key !== 'catalogue') return null;
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
