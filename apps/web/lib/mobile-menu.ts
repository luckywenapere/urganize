// What the phone's Menu sheet offers (2026-10-04, founder call: replace the
// bottom bar's row of tabs with Home, the UrgAns orb and a Menu button, and put
// everything else in a sheet of round buttons).
//
// This is the decision, kept free of React and of icons so vitest can hold it —
// the same reasoning lib/rollout-menu.ts and lib/app-pages.ts give. The sheet
// maps `icon` to a glyph and `settings` to the Settings pop-up.
//
// EVERY DESTINATION IS GATED ON THE SAME THING ITS OWN NAV ROW IS. With a flag
// off those pages bounce or 404, so offering one here would be a dead tile.
// The flags are passed in (not read here) so both states are testable without
// stubbing the environment.

import { settingsDeepLink, type SettingsTarget } from '@/lib/settings-nav';

export type MobileMenuGroupKey = 'work' | 'people' | 'account';

export type MobileMenuIcon =
  | 'catalog'
  | 'notes'
  | 'shows'
  | 'pitching'
  | 'artists'
  | 'press-kits'
  | 'relationships'
  | 'directory'
  | 'playlist-pitches'
  | 'settings'
  | 'billing'
  | 'credits'
  | 'admin';

export type MobileMenuItem = {
  key: string;
  label: string;
  href: string;
  icon: MobileMenuIcon;
  /** Set for the two tiles that open the Settings pop-up in place rather than
   *  navigating. `href` is still the real deep link, so a new tab works. */
  settings?: SettingsTarget;
  /** True for the one tile that means "leave the release I am in". */
  leavesRelease?: boolean;
};

export type MobileMenuGroup = {
  key: MobileMenuGroupKey;
  label: string;
  items: MobileMenuItem[];
};

export type MobileMenuFlags = {
  home: boolean;
  notes: boolean;
  events: boolean;
  pitching: boolean;
  /** Artist pages — already includes the workspace flag. */
  artists: boolean;
  pressKits: boolean;
  /** Relationships — already includes the workspace flag. */
  relationships: boolean;
  directory: boolean;
  credits: boolean;
};

export type MobileMenuAudience = {
  flags: MobileMenuFlags;
  /** Tri-state: null means the probe has not answered, and must NOT be read as
   *  false (the documented dual-account trap). Only a confirmed true adds the
   *  crossing. */
  hasCuratorProfile: boolean | null;
  isAdmin: boolean;
  /** Whether this account gets the Billing segment (`visibleSettingsSegments`). */
  canSeeBilling: boolean;
};

const GROUP_LABELS: Record<MobileMenuGroupKey, string> = {
  work: 'Work',
  people: 'People',
  account: 'Account',
};

/**
 * The groups, in order, with empty ones dropped. Order inside a group is how
 * often it is wanted, working surfaces first — the crossing into the other side
 * of the product (Playlist pitches) last in People, Admin last of all.
 *
 * Catalog is a tile ONLY when the Home flag is on: the bar's left tab is Home
 * then, and the catalog needs another way in. With the flag off the bar's left
 * tab already IS the catalog.
 */
export function buildMobileMenu(audience: MobileMenuAudience): MobileMenuGroup[] {
  const { flags, hasCuratorProfile, isAdmin, canSeeBilling } = audience;

  const work: MobileMenuItem[] = [];
  if (flags.home) {
    work.push({
      key: 'catalog',
      label: 'Catalog',
      href: '/dashboard',
      icon: 'catalog',
      leavesRelease: true,
    });
  }
  if (flags.notes) {
    work.push({ key: 'notes', label: 'Notes', href: '/dashboard/notes', icon: 'notes' });
  }
  if (flags.events) {
    work.push({ key: 'shows', label: 'Shows', href: '/dashboard/shows', icon: 'shows' });
  }
  if (flags.pitching) {
    work.push({ key: 'pitching', label: 'Pitching', href: '/dashboard/pitching', icon: 'pitching' });
  }
  if (flags.artists) {
    work.push({ key: 'artists', label: 'Artists', href: '/dashboard/artists', icon: 'artists' });
  }
  if (flags.pressKits) {
    work.push({
      key: 'press-kits',
      label: 'Press kits',
      href: '/dashboard/press-kits',
      icon: 'press-kits',
    });
  }

  const people: MobileMenuItem[] = [];
  if (flags.relationships) {
    people.push({
      key: 'relationships',
      label: 'Relationships',
      href: '/dashboard/relationships',
      icon: 'relationships',
    });
  }
  if (flags.directory) {
    people.push({
      key: 'directory',
      label: 'Directory',
      href: '/dashboard/directory',
      icon: 'directory',
    });
  }
  if (flags.pitching && hasCuratorProfile === true) {
    people.push({
      key: 'playlist-pitches',
      label: 'Playlist pitches',
      href: '/curator',
      icon: 'playlist-pitches',
    });
  }

  const account: MobileMenuItem[] = [
    {
      key: 'settings',
      label: 'Settings',
      href: settingsDeepLink(),
      icon: 'settings',
      settings: {},
    },
  ];
  if (canSeeBilling) {
    const target: SettingsTarget = { segment: 'billing' };
    account.push({
      key: 'billing',
      label: 'Billing',
      href: settingsDeepLink(target),
      icon: 'billing',
      settings: target,
    });
  }
  if (flags.credits) {
    account.push({ key: 'credits', label: 'Credits', href: '/dashboard/credits', icon: 'credits' });
  }
  if (isAdmin) {
    account.push({ key: 'admin', label: 'Admin', href: '/admin', icon: 'admin' });
  }

  const groups: MobileMenuGroup[] = [
    { key: 'work', label: GROUP_LABELS.work, items: work },
    { key: 'people', label: GROUP_LABELS.people, items: people },
    { key: 'account', label: GROUP_LABELS.account, items: account },
  ];
  return groups.filter((group) => group.items.length > 0);
}

/** Which tile, if any, is the current page. Prefix match so a show's own page
 *  keeps Shows lit. Settings tiles are never "the current page": Settings is a
 *  pop-up over whatever page this is. */
export function isMobileMenuItemActive(item: MobileMenuItem, pathname: string | null): boolean {
  if (!pathname || item.settings) return false;
  if (item.key === 'catalog') return pathname === '/dashboard';
  return pathname.startsWith(item.href);
}
