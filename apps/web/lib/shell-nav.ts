// The app's navigation, as data (design overhaul, 2026-10-04).
//
// One top bar of six areas (the strategy doc's seven, with UrgAns carried by the
// floating button instead of a pill), a second row of tabs for the area you are
// in, and a bottom bar on a phone. Everything the desktop top bar, the sub-tab
// row, the phone's bottom bar and its "More" sheet show comes from here, so they
// cannot disagree about what exists, what it is called or where it goes.
//
// Pure on purpose: the feature flags arrive as an argument, so the tests drive
// both states without stubbing the environment, and `readShellFlags` below is the
// only place that reads them.

export type ShellAreaKey =
  | 'home'
  | 'catalogue'
  | 'relationships'
  | 'opportunities'
  | 'audience'
  | 'pitching';

export type ShellFlags = {
  notes: boolean;
  events: boolean;
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
    events: process.env.NEXT_PUBLIC_FEATURE_EVENTS === 'true',
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
export const CATALOGUE_HREF = '/dashboard';

export function buildShellAreas(flags: ShellFlags): ShellArea[] {
  const catalogueTabs: ShellSubTab[] = [
    {
      key: 'releases',
      label: 'Rollouts',
      href: CATALOGUE_HREF,
      isActive: (p) => p === '/dashboard' || startsWithPath(p, '/dashboard/releases'),
    },
  ];
  if (flags.artistPage) {
    catalogueTabs.push({
      key: 'artists',
      label: 'Artists',
      href: '/dashboard/artists',
      isActive: (p) => startsWithPath(p, '/dashboard/artists'),
    });
  }
  if (flags.pressKits) {
    catalogueTabs.push({
      key: 'press-kits',
      label: 'Press kits',
      href: '/dashboard/press-kits',
      isActive: (p) => startsWithPath(p, '/dashboard/press-kits'),
    });
  }
  if (flags.notes) {
    catalogueTabs.push({
      key: 'notes',
      label: 'Notes',
      href: '/dashboard/notes',
      isActive: (p) => startsWithPath(p, '/dashboard/notes'),
    });
  }

  const relationshipTabs: ShellSubTab[] = [];
  if (flags.relationships) {
    relationshipTabs.push({
      key: 'people',
      label: 'People',
      href: '/dashboard/relationships',
      isActive: (p) => startsWithPath(p, '/dashboard/relationships'),
    });
  }
  if (flags.directory) {
    relationshipTabs.push({
      key: 'directory',
      label: 'Directory',
      href: '/dashboard/directory',
      isActive: (p) => startsWithPath(p, '/dashboard/directory'),
    });
  }
  // Shows sits with Relationships and Pitching has its own pill (founder call,
  // 2026-10-11: the two swapped places on desktop and on the phone).
  if (flags.events) {
    relationshipTabs.push({
      key: 'shows',
      label: 'Shows',
      href: '/dashboard/shows',
      isActive: (p) => startsWithPath(p, '/dashboard/shows'),
    });
  }

  const pitchingTabs: ShellSubTab[] = flags.pitching
    ? [
        {
          key: 'pitching',
          label: 'Pitching',
          href: '/dashboard/pitching',
          isActive: (p) => startsWithPath(p, '/dashboard/pitching'),
        },
      ]
    : [];

  return [
    {
      key: 'home',
      label: 'Home',
      href: HOME_HREF,
      live: true,
      subTabs: [],
      isActive: (p) => startsWithPath(p, HOME_HREF),
    },
    {
      key: 'catalogue',
      label: 'Catalogue',
      href: CATALOGUE_HREF,
      live: true,
      subTabs: catalogueTabs,
      isActive: (p) =>
        p === '/dashboard' ||
        startsWithPath(p, '/dashboard/releases') ||
        startsWithPath(p, '/dashboard/artists') ||
        startsWithPath(p, '/dashboard/press-kits') ||
        startsWithPath(p, '/dashboard/notes'),
    },
    // Pitching is third on the desktop top bar (founder, 2026-10-11).
    {
      key: 'pitching',
      label: 'Pitching',
      href: pitchingTabs[0]?.href ?? '/dashboard/pitching',
      live: pitchingTabs.length > 0,
      subTabs: pitchingTabs,
      isActive: (p) => startsWithPath(p, '/dashboard/pitching'),
    },
    {
      key: 'relationships',
      label: 'Relationships',
      href: '/dashboard/relationships',
      live: relationshipTabs.length > 0,
      subTabs: relationshipTabs,
      isActive: (p) =>
        startsWithPath(p, '/dashboard/relationships') ||
        startsWithPath(p, '/dashboard/directory') ||
        startsWithPath(p, '/dashboard/shows'),
    },
    {
      key: 'opportunities',
      label: 'Opportunities',
      href: '/dashboard/opportunities',
      live: true,
      subTabs: [],
      isActive: (p) => startsWithPath(p, '/dashboard/opportunities'),
    },
    {
      key: 'audience',
      label: 'Audience',
      href: '/dashboard/audience',
      live: false,
      subTabs: [],
      isActive: (p) => startsWithPath(p, '/dashboard/audience'),
    },
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
export function buildMobileTabs(): MobileTab[] {
  return [
    { key: 'home', label: 'Home', href: HOME_HREF, area: 'home' },
    { key: 'catalogue', label: 'Catalogue', href: CATALOGUE_HREF, area: 'catalogue' },
    { key: 'urgans', label: 'UrgAns', href: '/dashboard/urgans', area: 'urgans' },
    { key: 'pitching', label: 'Pitching', href: '/dashboard/pitching', area: 'pitching' },
  ];
}

/** Everything the bottom bar's tabs do not carry. */
export function buildMoreItems(
  areas: ShellArea[]
): Array<{ key: string; label: string; href: string; soon: boolean }> {
  const keep: ShellAreaKey[] = ['relationships', 'opportunities', 'audience'];
  return areas
    .filter((area) => keep.includes(area.key))
    .map((area) => ({ key: area.key, label: area.label, href: area.href, soon: !area.live }));
}

/** Which bottom-bar tab is lit. More lights for any area it holds. */
export function activeMobileTab(areas: ShellArea[], pathname: string): string {
  if (startsWithPath(pathname, '/dashboard/urgans')) return 'urgans';
  const area = activeShellArea(areas, pathname);
  if (!area) return 'more';
  if (area.key === 'home' || area.key === 'catalogue' || area.key === 'pitching') return area.key;
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
  const tab = visibleSubTabs(area).find((candidate) => candidate.isActive(pathname));
  return tab?.label ?? area.label;
}
