import { describe, expect, it } from 'vitest';
import {
  buildMobileMenu,
  isMobileMenuItemActive,
  type MobileMenuAudience,
  type MobileMenuFlags,
} from './mobile-menu';

const ALL_OFF: MobileMenuFlags = {
  home: false,
  notes: false,
  pitching: false,
  artists: false,
  pressKits: false,
  relationships: false,
  directory: false,
  credits: false,
};

const ALL_ON: MobileMenuFlags = Object.fromEntries(
  Object.keys(ALL_OFF).map((key) => [key, true])
) as MobileMenuFlags;

function audience(over: Partial<MobileMenuAudience> = {}): MobileMenuAudience {
  return {
    flags: ALL_OFF,
    hasCuratorProfile: false,
    isAdmin: false,
    canSeeBilling: false,
    ...over,
  };
}

const keys = (a: MobileMenuAudience) =>
  buildMobileMenu(a).flatMap((group) => group.items.map((item) => item.key));

describe('buildMobileMenu', () => {
  it('always offers Settings, so the sheet can never open empty', () => {
    expect(keys(audience())).toEqual(['settings']);
  });

  it('puts every tile in a labelled group, in Work, People, Account order', () => {
    const groups = buildMobileMenu(
      audience({ flags: ALL_ON, hasCuratorProfile: true, isAdmin: true, canSeeBilling: true })
    );
    expect(groups.map((group) => group.key)).toEqual(['work', 'people', 'account']);
    expect(groups.map((group) => group.label)).toEqual(['Work', 'People', 'Account']);
  });

  it('shows everything for a fully enabled admin who owns a plan and a playlist', () => {
    expect(
      keys(audience({ flags: ALL_ON, hasCuratorProfile: true, isAdmin: true, canSeeBilling: true }))
    ).toEqual([
      'catalog',
      'notes',
      'artists',
      'directory',
      'relationships',
      'playlist-pitches',
      'settings',
      'billing',
      'credits',
      'admin',
    ]);
  });

  it('drops a group whose every tile is flagged off', () => {
    const groups = buildMobileMenu(audience({ flags: { ...ALL_OFF, notes: true } }));
    expect(groups.map((group) => group.key)).toEqual(['work', 'account']);
  });

  it('only offers the Catalog tile while the Home flag makes the bar tab Home', () => {
    expect(keys(audience({ flags: { ...ALL_OFF, home: false } }))).not.toContain('catalog');
    expect(keys(audience({ flags: { ...ALL_OFF, home: true } }))).toContain('catalog');
  });

  it('treats an unanswered curator probe as no, never as yes', () => {
    const flags = { ...ALL_OFF, pitching: true };
    expect(keys(audience({ flags, hasCuratorProfile: null }))).not.toContain('playlist-pitches');
    expect(keys(audience({ flags, hasCuratorProfile: false }))).not.toContain('playlist-pitches');
    expect(keys(audience({ flags, hasCuratorProfile: true }))).toContain('playlist-pitches');
  });

  it('needs the pitching flag as well as a curator profile for the crossing', () => {
    expect(keys(audience({ hasCuratorProfile: true }))).not.toContain('playlist-pitches');
  });

  it('shows Admin and Billing only to accounts that have them', () => {
    expect(keys(audience())).not.toContain('admin');
    expect(keys(audience())).not.toContain('billing');
    expect(keys(audience({ isAdmin: true }))).toContain('admin');
    expect(keys(audience({ canSeeBilling: true }))).toContain('billing');
  });

  it('opens Settings and Billing as Settings targets, with a real deep link', () => {
    const account = buildMobileMenu(audience({ canSeeBilling: true })).find(
      (group) => group.key === 'account'
    )!;
    const settings = account.items.find((item) => item.key === 'settings')!;
    const billing = account.items.find((item) => item.key === 'billing')!;
    expect(settings.settings).toEqual({});
    expect(billing.settings).toEqual({ segment: 'billing' });
    expect(billing.href).toContain('settings=billing');
    expect(settings.href).toContain('settings');
  });

  it('gives every tile a unique key', () => {
    const all = keys(
      audience({ flags: ALL_ON, hasCuratorProfile: true, isAdmin: true, canSeeBilling: true })
    );
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('isMobileMenuItemActive', () => {
  const find = (key: string) =>
    buildMobileMenu(
      audience({ flags: ALL_ON, hasCuratorProfile: true, isAdmin: true, canSeeBilling: true })
    )
      .flatMap((group) => group.items)
      .find((item) => item.key === key)!;

  it('keeps My People lit on a person page', () => {
    expect(isMobileMenuItemActive(find('relationships'), '/dashboard/relationships/abc')).toBe(true);
  });

  it('lights Catalog only on the bare catalog', () => {
    expect(isMobileMenuItemActive(find('catalog'), '/dashboard')).toBe(true);
    expect(isMobileMenuItemActive(find('catalog'), '/dashboard/notes')).toBe(false);
  });

  it('never lights a Settings tile, because Settings is a pop-up over the page', () => {
    expect(isMobileMenuItemActive(find('settings'), '/dashboard')).toBe(false);
    expect(isMobileMenuItemActive(find('billing'), '/dashboard')).toBe(false);
  });

  it('is never active without a pathname', () => {
    expect(isMobileMenuItemActive(find('notes'), null)).toBe(false);
  });
});
