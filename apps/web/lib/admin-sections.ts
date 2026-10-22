// Every internal dashboard, and which of them the admin menu shows
// (iteration 4, 2026-10-09; slimmed 2026-10-18, URG-369; bottom bar on phone
// 2026-10-18, founder approved the mock: "Sure").
//
// THE MENU is four tabs, in this order: Overview, Teams, Emails, More
// (ADMIN_PRIMARY_NAV). The phone draws them as a bottom bar with icon and
// label (AdminNav, like the catalog's BottomBar); the desktop sidebar draws
// the same list, so the two cannot drift. Everything else sits behind More,
// which opens /admin/more: the full list, grouped, with Runway on top.
// Scoreboard and Metrics left the tabs: the Overview's "Today" header opens
// Metrics and its "This week" header opens Scoreboard, the people tiles open
// the matching Metrics section, and both are listed on More under Numbers.
// Nothing was deleted to get here:
//  - Growth is merged into Metrics (its accounts-per-month and waitlist
//    sections render at the bottom of /admin/metrics; /admin/growth redirects).
//  - Chappi left the menu; its route is kept and listed on More.
// lib/admin-sections.test.ts guards the menu, the More list and the moves.
//
// Groups on More, in the order they show:
//  - Numbers:    pages that answer "how are we doing" (read only).
//  - Operations: pages where someone acts on a team, a person, money or a
//                report.
//  - Content:    what Urganize says to people, and the mascot's model sheet.
// Inside a group, the most used first.
//
// No icons here so the test can import it without the icon set; the menu and
// More map each key to an icon.

export type AdminSectionGroup = 'numbers' | 'operations' | 'content';

export const ADMIN_SECTION_GROUPS: Array<{ key: AdminSectionGroup; label: string }> = [
  { key: 'numbers', label: 'Numbers' },
  { key: 'operations', label: 'Operations' },
  { key: 'content', label: 'Content' },
];

export type AdminSection = {
  /** The same key the side menu uses. */
  key: string;
  label: string;
  href: string;
  group: AdminSectionGroup;
  /** One short line: what you find or do there. */
  description: string;
};

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    key: 'scoreboard',
    label: 'Scoreboard',
    href: '/admin/scoreboard',
    group: 'numbers',
    description: 'The strategy numbers, per team, and the Friday post.',
  },
  {
    key: 'metrics',
    label: 'Metrics',
    href: '/admin/metrics',
    group: 'numbers',
    description: 'Who is online, active people, sign-ups and the waitlist.',
  },
  {
    key: 'onboarding',
    label: 'Onboarding',
    href: '/admin/onboarding',
    group: 'numbers',
    description: 'What sign-ups pick in the setup wizard.',
  },
  {
    key: 'nps',
    label: 'NPS',
    href: '/admin/nps',
    group: 'numbers',
    description: 'Would people recommend us? The score and what they said.',
  },
  {
    key: 'profile-funnel',
    label: 'Profile funnel',
    href: '/admin/profile-funnel',
    group: 'numbers',
    description: 'Credits to claimed pages to sign-ups, last 30 days.',
  },
  {
    key: 'teams',
    label: 'Teams',
    href: '/admin/teams',
    group: 'operations',
    description: 'Trials and deals. Extend, comp or mark paid.',
  },
  {
    key: 'self-serve',
    label: 'Self-serve',
    href: '/admin/self-serve',
    group: 'operations',
    description: 'Checkout cohorts, recorded transfers and founder minutes.',
  },
  {
    key: 'waitlist',
    label: 'Waitlist',
    href: '/admin/waitlist',
    group: 'operations',
    description: 'Waitlist sign-ups and who has been contacted.',
  },
  {
    key: 'billing',
    label: 'Billing margin',
    href: '/admin/billing',
    group: 'numbers',
    description: 'What each paying team leaves after fees, TRM and credits.',
  },
  {
    key: 'referrals',
    label: 'Referrals',
    href: '/admin/referrals',
    group: 'operations',
    description: 'Partner codes, teams they brought, commission owed.',
  },
  {
    key: 'interviews',
    label: 'Interviews',
    href: '/admin/interviews',
    group: 'operations',
    description: 'Artist interview slots booked on the website.',
  },
  {
    key: 'issue-reports',
    label: 'Reports',
    href: '/admin/issue-reports',
    group: 'operations',
    description: 'What users reported as broken, and its Linear issue.',
  },
  {
    key: 'pitch-payments',
    label: 'Pitch payments',
    href: '/admin/pitch-payments',
    group: 'operations',
    description: 'Pitch payments, payouts and refunds that need a person.',
  },
  {
    key: 'curator-invites',
    label: 'Playlist owners',
    href: '/admin/curator-invites',
    group: 'operations',
    description: 'Invite links for playlist owners, and who used them.',
  },
  {
    key: 'directory',
    label: 'Directory',
    href: '/admin/directory',
    group: 'operations',
    description: 'Roles managers ask for against people listed.',
  },
  {
    key: 'claims',
    label: 'Claims',
    href: '/admin/claims',
    group: 'operations',
    description: 'Unclaimed profiles from credits, and removal requests.',
  },
  {
    key: 'seeding',
    label: 'Seeding',
    href: '/admin/seeding',
    group: 'operations',
    description: 'Invite managers to a profile built with them.',
  },
  {
    key: 'featured',
    label: 'Featured',
    href: '/admin/featured',
    group: 'operations',
    description: 'Pick who is Featured in the directory each quarter.',
  },
  {
    key: 'promo-channels',
    label: 'Promo channels',
    href: '/admin/promo-channels',
    group: 'operations',
    description: 'Review suggested radio, blogs and communities.',
  },
  {
    key: 'urgans',
    label: 'UrgAns actions',
    href: '/admin/urgans',
    group: 'operations',
    description: 'UrgAns drafts per team: made, applied, cost.',
  },
  {
    key: 'emails',
    label: 'Emails',
    href: '/admin/emails',
    group: 'content',
    description: 'Every email Urganize sends, and write your own.',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    href: '/admin/notifications',
    group: 'content',
    description: 'Wording and timing of reminders and nudges.',
  },
  {
    key: 'chappi',
    label: 'Chappi',
    href: '/admin/chappi',
    group: 'content',
    description: "The mascot's model sheet.",
  },
];

/** The sections of one group, in the order they show. */
export function sectionsInGroup(group: AdminSectionGroup): AdminSection[] {
  return ADMIN_SECTIONS.filter((section) => section.group === group);
}

/** The admin menu, in order. Overview and More are not dashboards of their own. */
export type AdminNavEntry = { key: string; label: string; href: string; exact?: boolean };

export const ADMIN_PRIMARY_NAV: AdminNavEntry[] = [
  { key: 'overview', label: 'Overview', href: '/admin', exact: true },
  { key: 'teams', label: 'Teams', href: '/admin/teams' },
  { key: 'emails', label: 'Emails', href: '/admin/emails' },
  { key: 'more', label: 'More', href: '/admin/more' },
];

const PRIMARY_KEYS = new Set(ADMIN_PRIMARY_NAV.map((item) => item.key));

/** The dashboards only reachable through More (the rows on More, and its count). */
export const ADMIN_MORE_SECTIONS: AdminSection[] = ADMIN_SECTIONS.filter((section) => !PRIMARY_KEYS.has(section.key));

/** More's rows of one group, in the order they show. */
export function moreSectionsInGroup(group: AdminSectionGroup): AdminSection[] {
  return ADMIN_MORE_SECTIONS.filter((section) => section.group === group);
}

/** More's search: a row matches on its label or its one-line description. */
export function matchesSearch(section: Pick<AdminSection, 'label' | 'description'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return section.label.toLowerCase().includes(q) || section.description.toLowerCase().includes(q);
}

/**
 * Pages that left the tabs but belong to one: their back button names that tab
 * and the bar lights it. Scoreboard and Metrics are read from the Overview.
 */
const PARENT_TAB: Record<string, string> = {
  scoreboard: 'overview',
  metrics: 'overview',
};

/** Old addresses that now live somewhere else. */
export const ADMIN_REDIRECTS: Record<string, string> = {
  '/admin/growth': '/admin/metrics#growth',
};

function under(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function clean(pathname: string): string {
  return (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '') || '/admin';
}

/** Which tab is lit for a page: its own tab, its parent's, or More for anything behind it. */
export function activeNavKey(pathname: string): string | null {
  const path = clean(pathname);
  if (path === '/admin') return 'overview';
  for (const item of ADMIN_PRIMARY_NAV) {
    if (item.exact) continue;
    if (under(path, item.href)) return item.key;
  }
  const section = ADMIN_MORE_SECTIONS.find((entry) => under(path, entry.href));
  if (!section) return null;
  return PARENT_TAB[section.key] ?? 'more';
}

/**
 * Where a page's back button goes: the tab it sits under, by that tab's name.
 * Null on a tab itself (the bar is the way around) and on pages outside /admin.
 */
export function adminBackTarget(pathname: string): { label: string; href: string } | null {
  const path = clean(pathname);
  if (ADMIN_PRIMARY_NAV.some((item) => item.href === path)) return null;
  const key = activeNavKey(path);
  if (!key) return null;
  const tab = ADMIN_PRIMARY_NAV.find((item) => item.key === key);
  return tab ? { label: tab.label, href: tab.href } : null;
}
