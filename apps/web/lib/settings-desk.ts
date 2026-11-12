// Settings on a computer (#1226, part of #1175; founder approved mock
// docs/mocks/account-team-desktop): one page with a left menu in two groups,
// "Your team" and "You", and the chosen page on the right. Team, AI credits and
// Trash keep their own addresses; everything else sits on the Account address
// with ?page=. Pure, so the menu, the addresses and the fallbacks are tested.

import {
  TEAM_PAGE_HREF,
  visibleSettingsSegments,
  type SettingsFlags,
  type SettingsSegment,
  type SettingsViewer,
} from '@/lib/settings-nav';

/** The Account address (SETTINGS_PAGE_HREF in lib/swipe-nav; a literal here so
 *  this module needs nothing from the nav). */
export const SETTINGS_PAGE_ACCOUNT_HREF = '/dashboard/account';

export type DeskPage =
  | 'team'
  | 'artists'
  | 'billing'
  | 'credits'
  | 'ai'
  | 'trash'
  | 'profile'
  | 'notifications'
  | 'appearance'
  | 'security'
  | 'admin';

export const DESK_PAGE_PARAM = 'page';

export const DESK_PAGE_LABELS: Record<DeskPage, string> = {
  team: 'Team',
  artists: 'Artists and brand',
  billing: 'Plan and billing',
  credits: 'AI credits',
  ai: 'AI',
  trash: 'Trash',
  profile: 'Profile',
  notifications: 'Notifications',
  appearance: 'Appearance',
  security: 'Security',
  admin: 'Admin',
};

/** Pages with an address of their own. The rest live on the Account address. */
const OWN_ADDRESS: Partial<Record<DeskPage, string>> = {
  team: TEAM_PAGE_HREF,
  credits: '/dashboard/credits',
  trash: '/dashboard/trash',
};

export const DESK_DEFAULT_PAGE: DeskPage = 'profile';

export type DeskMenuItem = { key: DeskPage; label: string; href: string };
export type DeskMenuGroup = { label: 'Your team' | 'You'; items: DeskMenuItem[] };

export function deskHref(page: DeskPage): string {
  return OWN_ADDRESS[page] ?? `${SETTINGS_PAGE_ACCOUNT_HREF}?${DESK_PAGE_PARAM}=${page}`;
}

const item = (key: DeskPage): DeskMenuItem => ({ key, label: DESK_PAGE_LABELS[key], href: deskHref(key) });

/**
 * The menu this person gets. It follows visibleSettingsSegments, so nobody is
 * shown a door the server would refuse. Team and Trash are for everyone with a
 * team (the phone menu already shows them to everyone but curators); AI
 * credits follows the credits switch.
 */
export function deskMenu(viewer: SettingsViewer, flags: SettingsFlags, options: { credits: boolean }): DeskMenuGroup[] {
  const segments = visibleSettingsSegments(viewer, flags);
  if (segments.length === 0) return [];
  const has = (segment: SettingsSegment) => segments.includes(segment);

  const team: DeskPage[] = ['team'];
  if (has('artists')) team.push('artists');
  if (has('billing')) team.push('billing');
  if (options.credits) team.push('credits');
  if (has('urgans')) team.push('ai');
  team.push('trash');

  const you: DeskPage[] = ['profile'];
  if (has('notifications')) you.push('notifications');
  you.push('appearance');
  if (has('security')) you.push('security');
  if (has('admin')) you.push('admin');

  return [
    { label: 'Your team', items: team.map(item) },
    { label: 'You', items: you.map(item) },
  ];
}

export const deskMenuPages = (menu: readonly DeskMenuGroup[]): DeskPage[] =>
  menu.flatMap((group) => group.items.map((entry) => entry.key));

const isDeskPage = (value: string | null | undefined): value is DeskPage =>
  Boolean(value) && Object.prototype.hasOwnProperty.call(DESK_PAGE_LABELS, value as string);

/**
 * Which page the Account address shows. Unknown, missing, or a page this person
 * does not have opens Plan and billing (what the avatar used to lead with),
 * or Profile for someone with no plan to manage. A page with its own address
 * is never drawn here.
 */
export function readDeskPageParam(param: string | null | undefined, visible: readonly DeskPage[]): DeskPage {
  if (isDeskPage(param) && !OWN_ADDRESS[param] && visible.includes(param)) return param;
  return visible.includes('billing') ? 'billing' : DESK_DEFAULT_PAGE;
}

/** Where an old settings link (a segment and maybe a section) lands now. */
export function deskPageForSegment(segment: SettingsSegment, section: string | null): DeskPage | null {
  switch (segment) {
    case 'general':
      return section === 'theme' ? 'appearance' : 'profile';
    case 'notifications':
      return 'notifications';
    case 'team':
      return 'team';
    case 'artists':
      return 'artists';
    case 'urgans':
      return 'ai';
    case 'billing':
      return 'billing';
    case 'security':
      return 'security';
    case 'admin':
      return 'admin';
    default:
      // Directory and Connections were retired; they open the default page.
      return null;
  }
}

/** The menu row to light for an address, or null off the settings pages. */
export function deskActivePage(pathname: string | null | undefined, pageParam: string | null): DeskPage | null {
  const path = (pathname ?? '').replace(/\/+$/, '');
  for (const [page, href] of Object.entries(OWN_ADDRESS)) {
    if (path === href) return page as DeskPage;
  }
  if (path === SETTINGS_PAGE_ACCOUNT_HREF) return isDeskPage(pageParam) ? pageParam : null;
  return null;
}
