import { describe, expect, it } from 'vitest';
import {
  DESK_DEFAULT_PAGE,
  deskActivePage,
  deskHref,
  deskMenu,
  deskPageForSegment,
  readDeskPageParam,
} from './settings-desk';
import type { SettingsFlags } from './settings-nav';

const flags: SettingsFlags = {
  directory: false,
  teamBrief: false,
  workspace: true,
  pressKits: true,
  mcpConnect: false,
  dataExport: false,
};

const keys = (menu: ReturnType<typeof deskMenu>) => menu.map((group) => [group.label, group.items.map((item) => item.key)]);

describe('deskMenu', () => {
  it('gives a manager both groups in the mock order, with AI after AI credits', () => {
    expect(keys(deskMenu({ role: 'manager' }, flags, { credits: true }))).toEqual([
      ['Your team', ['team', 'artists', 'billing', 'credits', 'ai', 'trash']],
      ['You', ['profile', 'notifications', 'appearance', 'security']],
    ]);
  });

  it('hides what a teammate cannot change, and adds Admin only for admins', () => {
    const menu = deskMenu({ role: 'team-member', isAdmin: true }, flags, { credits: true });
    expect(keys(menu)).toEqual([
      ['Your team', ['team', 'credits', 'trash']],
      ['You', ['profile', 'notifications', 'appearance', 'security', 'admin']],
    ]);
  });

  it('leaves AI credits out while credits are off', () => {
    const menu = deskMenu({ role: 'manager' }, flags, { credits: false });
    expect(menu[0].items.map((item) => item.key)).not.toContain('credits');
  });

  it('gives a curator nothing', () => {
    expect(deskMenu({ role: 'curator' }, flags, { credits: true })).toEqual([]);
  });

  it('uses the plain labels from the mock', () => {
    const labels = deskMenu({ role: 'manager' }, flags, { credits: true }).flatMap((group) => group.items.map((item) => item.label));
    expect(labels).toEqual([
      'Team',
      'Artists and brand',
      'Plan and billing',
      'AI credits',
      'AI',
      'Trash',
      'Profile',
      'Notifications',
      'Appearance',
      'Security',
    ]);
    expect(labels.join(' ')).not.toMatch(/&/);
  });
});

describe('deskHref', () => {
  it('keeps Team, AI credits and Trash on their own addresses', () => {
    expect(deskHref('team')).toBe('/dashboard/team');
    expect(deskHref('credits')).toBe('/dashboard/credits');
    expect(deskHref('trash')).toBe('/dashboard/trash');
  });

  it('puts the rest on the Account address with a page param', () => {
    expect(deskHref('billing')).toBe('/dashboard/account?page=billing');
    expect(deskHref('appearance')).toBe('/dashboard/account?page=appearance');
  });
});

describe('readDeskPageParam', () => {
  const visible = ['team', 'billing', 'profile', 'security'] as const;
  it('opens a known page the person has', () => {
    expect(readDeskPageParam('security', visible)).toBe('security');
  });
  it('falls back to Plan and billing, then Profile', () => {
    expect(readDeskPageParam(null, visible)).toBe('billing');
    expect(readDeskPageParam('admin', visible)).toBe('billing');
    expect(readDeskPageParam('nonsense', ['profile', 'security'])).toBe(DESK_DEFAULT_PAGE);
  });
  it('never opens a page that lives on its own address', () => {
    expect(readDeskPageParam('team', visible)).toBe('billing');
  });
});

describe('deskPageForSegment', () => {
  it('maps old settings segments and sections onto the menu', () => {
    expect(deskPageForSegment('general', 'theme')).toBe('appearance');
    expect(deskPageForSegment('general', 'name')).toBe('profile');
    expect(deskPageForSegment('general', null)).toBe('profile');
    expect(deskPageForSegment('urgans', null)).toBe('ai');
    expect(deskPageForSegment('billing', null)).toBe('billing');
    expect(deskPageForSegment('team', null)).toBe('team');
    expect(deskPageForSegment('connections', null)).toBeNull();
    expect(deskPageForSegment('directory', null)).toBeNull();
  });
});

describe('deskActivePage', () => {
  it('lights the right row for each address', () => {
    expect(deskActivePage('/dashboard/team', null)).toBe('team');
    expect(deskActivePage('/dashboard/credits', null)).toBe('credits');
    expect(deskActivePage('/dashboard/trash', null)).toBe('trash');
    expect(deskActivePage('/dashboard/account', 'notifications')).toBe('notifications');
    expect(deskActivePage('/dashboard', null)).toBeNull();
  });
});

describe('the Account address', () => {
  it('is the same one the avatar opens', async () => {
    const { SETTINGS_PAGE_HREF } = await import('./swipe-nav');
    const { SETTINGS_PAGE_ACCOUNT_HREF } = await import('./settings-desk');
    expect(SETTINGS_PAGE_ACCOUNT_HREF).toBe(SETTINGS_PAGE_HREF);
  });
});
