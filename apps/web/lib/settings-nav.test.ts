import { describe, expect, it } from 'vitest';
import {
  settingsLeaveHref,
  SETTINGS_MENU,
  SETTINGS_SEGMENTS,
  buildSettingsUrl,
  canDeleteRollouts,
  canHostSettings,
  closeSettingsUrl,
  isPlainLeftClick,
  legacySettingsTarget,
  readSettingsRequest,
  resolveDesktopSegment,
  resolveSettingsView,
  settingsDeepLink,
  visibleSettingsSegments,
  type SettingsFlags,
} from './settings-nav';

const ALL_ON: SettingsFlags = {
  directory: true,
  teamBrief: true,
  workspace: true,
  pressKits: true,
  mcpConnect: true,
  dataExport: true,
};

const ALL_OFF: SettingsFlags = {
  directory: false,
  teamBrief: false,
  workspace: false,
  pressKits: false,
  mcpConnect: false,
  dataExport: false,
};

const params = (query: string) => new URLSearchParams(query);

describe('the segment list', () => {
  it('is nine segments in the order the founder chose', () => {
    expect([...SETTINGS_SEGMENTS]).toEqual([
      'general',
      'notifications',
      'team',
      'artists',
      'urgans',
      'directory',
      'billing',
      'connections',
      'security',
    ]);
  });
});

describe('visibleSettingsSegments', () => {
  it('shows a manager all nine with every flag on, in order', () => {
    expect(visibleSettingsSegments({ role: 'manager' }, ALL_ON)).toEqual([...SETTINGS_SEGMENTS]);
  });

  it('treats artist-manager as a manager', () => {
    expect(visibleSettingsSegments({ role: 'artist-manager' }, ALL_ON)).toEqual([
      ...SETTINGS_SEGMENTS,
    ]);
  });

  it('never shows Team or Artists & brand to somebody who cannot change them', () => {
    for (const role of ['artist', 'team-member', 'artist-team', 'viewer', null, undefined]) {
      const visible = visibleSettingsSegments({ role }, ALL_ON);
      expect(visible).not.toContain('team');
      expect(visible).not.toContain('artists');
    }
  });

  it('keeps Billing for the accounts that own a plan (manager, artist) and hides it from teammates and viewers', () => {
    expect(visibleSettingsSegments({ role: 'manager' }, ALL_ON)).toContain('billing');
    expect(visibleSettingsSegments({ role: 'artist' }, ALL_ON)).toContain('billing');
    expect(visibleSettingsSegments({ role: 'team-member' }, ALL_ON)).not.toContain('billing');
    expect(visibleSettingsSegments({ role: 'viewer' }, ALL_ON)).not.toContain('billing');
  });

  it('gives a viewer only the personal segments', () => {
    expect(visibleSettingsSegments({ role: 'viewer' }, ALL_ON)).toEqual([
      'general',
      'notifications',
      'urgans',
      'directory',
      'connections',
      'security',
    ]);
  });

  it('gives a curator-only account nothing, since it has no workspace chrome', () => {
    expect(visibleSettingsSegments({ role: 'curator' }, ALL_ON)).toEqual([]);
  });

  it('hides Directory when its flag is off', () => {
    expect(visibleSettingsSegments({ role: 'manager' }, { ...ALL_ON, directory: false })).not.toContain(
      'directory'
    );
  });

  it('hides UrgAns when the team brief is off, since the brief is all it holds', () => {
    expect(visibleSettingsSegments({ role: 'manager' }, { ...ALL_ON, teamBrief: false })).not.toContain(
      'urgans'
    );
  });

  it('keeps Artists & brand while either the roster or press kits exists, and drops it when neither does', () => {
    expect(
      visibleSettingsSegments({ role: 'manager' }, { ...ALL_OFF, workspace: true })
    ).toContain('artists');
    expect(
      visibleSettingsSegments({ role: 'manager' }, { ...ALL_OFF, pressKits: true })
    ).toContain('artists');
    expect(visibleSettingsSegments({ role: 'manager' }, ALL_OFF)).not.toContain('artists');
  });

  it('keeps Connections & data while either AI apps or export exists, and drops it when neither does', () => {
    expect(
      visibleSettingsSegments({ role: 'manager' }, { ...ALL_OFF, mcpConnect: true })
    ).toContain('connections');
    expect(
      visibleSettingsSegments({ role: 'manager' }, { ...ALL_OFF, dataExport: true })
    ).toContain('connections');
    expect(visibleSettingsSegments({ role: 'manager' }, ALL_OFF)).not.toContain('connections');
  });

  it('always keeps General, Notifications and Security & account, so the pop-up is never empty', () => {
    for (const role of ['manager', 'artist', 'team-member', 'viewer']) {
      const visible = visibleSettingsSegments({ role }, ALL_OFF);
      expect(visible).toEqual(expect.arrayContaining(['general', 'notifications', 'security']));
    }
  });
});

describe('canDeleteRollouts', () => {
  it('is for the accounts that can own a rollout', () => {
    expect(canDeleteRollouts('manager')).toBe(true);
    expect(canDeleteRollouts('artist')).toBe(true);
    expect(canDeleteRollouts('team-member')).toBe(false);
    expect(canDeleteRollouts('viewer')).toBe(false);
    expect(canDeleteRollouts(undefined)).toBe(false);
  });
});

describe('readSettingsRequest', () => {
  it('reads closed as null', () => {
    expect(readSettingsRequest(params(''))).toBeNull();
    expect(readSettingsRequest(params('release=abc'))).toBeNull();
  });

  it('reads a known segment', () => {
    expect(readSettingsRequest(params('settings=billing'))).toEqual({
      request: 'billing',
      section: null,
    });
  });

  it('reads the section with it', () => {
    expect(readSettingsRequest(params('settings=artists&section=brand-colors'))).toEqual({
      request: 'artists',
      section: 'brand-colors',
    });
  });

  it('treats an empty or unknown value as the menu, so a stale link still opens something real', () => {
    expect(readSettingsRequest(params('settings='))).toEqual({ request: SETTINGS_MENU, section: null });
    expect(readSettingsRequest(params('settings=bogus'))).toEqual({
      request: SETTINGS_MENU,
      section: null,
    });
  });

  it('is case-sensitive, because the app is the only thing that writes it', () => {
    expect(readSettingsRequest(params('settings=Billing'))?.request).toBe(SETTINGS_MENU);
  });
});

describe('resolveSettingsView', () => {
  const managerView = visibleSettingsSegments({ role: 'manager' }, ALL_ON);
  const viewerView = visibleSettingsSegments({ role: 'viewer' }, ALL_ON);

  it('opens the requested segment when it is visible', () => {
    expect(resolveSettingsView('billing', managerView)).toBe('billing');
  });

  it('falls back to the menu when the segment is not visible to this person', () => {
    expect(resolveSettingsView('team', viewerView)).toBe(SETTINGS_MENU);
  });

  it('keeps the menu as the menu', () => {
    expect(resolveSettingsView(SETTINGS_MENU, managerView)).toBe(SETTINGS_MENU);
  });
});

describe('resolveDesktopSegment', () => {
  const visible = visibleSettingsSegments({ role: 'viewer' }, ALL_ON);

  it('turns the menu into the first visible segment, because a wide screen shows the nav and a pane together', () => {
    expect(resolveDesktopSegment(SETTINGS_MENU, visible)).toBe('general');
  });

  it('leaves a real segment alone', () => {
    expect(resolveDesktopSegment('security', visible)).toBe('security');
  });

  it('is null when there is nothing to show', () => {
    expect(resolveDesktopSegment(SETTINGS_MENU, [])).toBeNull();
  });
});

describe('buildSettingsUrl', () => {
  it('opens on the current page and keeps every other param', () => {
    expect(buildSettingsUrl('/dashboard', 'release=abc&scene=metadata', { segment: 'billing' })).toBe(
      '/dashboard?release=abc&scene=metadata&settings=billing'
    );
  });

  it('opens at the menu when no segment is given', () => {
    expect(buildSettingsUrl('/dashboard', '')).toBe('/dashboard?settings=menu');
  });

  it('carries the section', () => {
    expect(buildSettingsUrl('/dashboard', '', { segment: 'artists', section: 'brand-colors' })).toBe(
      '/dashboard?settings=artists&section=brand-colors'
    );
  });

  it('drops a stale section when the next target has none', () => {
    expect(buildSettingsUrl('/dashboard', 'settings=artists&section=brand-colors', { segment: 'team' })).toBe(
      '/dashboard?settings=team'
    );
  });

  it('accepts a leading question mark on the search string', () => {
    expect(buildSettingsUrl('/dashboard', '?release=abc', { segment: 'team' })).toBe(
      '/dashboard?release=abc&settings=team'
    );
  });
});

describe('closeSettingsUrl', () => {
  it('removes only the settings params', () => {
    expect(closeSettingsUrl('/dashboard', 'release=abc&settings=team&section=teammates&scene=timeline')).toBe(
      '/dashboard?release=abc&scene=timeline'
    );
  });

  it('leaves a clean path when nothing else was there', () => {
    expect(closeSettingsUrl('/dashboard', 'settings=general')).toBe('/dashboard');
  });
});

describe('settingsDeepLink', () => {
  it('points at the dashboard, because callers outside app chrome need somewhere with chrome', () => {
    expect(settingsDeepLink({ segment: 'billing' })).toBe('/dashboard?settings=billing');
    expect(settingsDeepLink({ segment: 'directory', section: 'directory' })).toBe(
      '/dashboard?settings=directory&section=directory'
    );
    expect(settingsDeepLink()).toBe('/dashboard?settings=menu');
  });
});

describe('legacySettingsTarget (the /settings redirect stub)', () => {
  it('sends plain /settings to the menu', () => {
    expect(legacySettingsTarget('', '')).toEqual({ segment: SETTINGS_MENU, section: null });
  });

  it('maps each old tab', () => {
    expect(legacySettingsTarget('?tab=account', '').segment).toBe('general');
    expect(legacySettingsTarget('?tab=workspace', '').segment).toBe('artists');
    expect(legacySettingsTarget('?tab=team', '').segment).toBe('team');
    expect(legacySettingsTarget('?tab=notifications', '').segment).toBe('notifications');
  });

  it('maps each old anchor, and the anchor wins because it is the more specific of the two', () => {
    expect(legacySettingsTarget('', '#teammates')).toEqual({ segment: 'team', section: 'teammates' });
    expect(legacySettingsTarget('', '#team-logins')).toEqual({ segment: 'team', section: 'team-logins' });
    expect(legacySettingsTarget('', '#directory')).toEqual({ segment: 'directory', section: 'directory' });
    expect(legacySettingsTarget('', '#brand-colors')).toEqual({
      segment: 'artists',
      section: 'brand-colors',
    });
    expect(legacySettingsTarget('', '#connected-apps')).toEqual({
      segment: 'connections',
      section: 'connected-apps',
    });
    expect(legacySettingsTarget('?tab=workspace', '#brand-colors')).toEqual({
      segment: 'artists',
      section: 'brand-colors',
    });
  });

  it('lets a real tab stand when the anchor is unknown', () => {
    expect(legacySettingsTarget('?tab=team', '#something-else')).toEqual({
      segment: 'team',
      section: null,
    });
  });

  it('falls back to the menu for an unknown tab, like the old page fell back to Account', () => {
    expect(legacySettingsTarget('?tab=billing', '')).toEqual({ segment: SETTINGS_MENU, section: null });
  });
});

describe('canHostSettings', () => {
  it('is true where AppShell mounts the pop-up', () => {
    expect(canHostSettings('/dashboard')).toBe(true);
    expect(canHostSettings('/dashboard/urgans')).toBe(true);
    expect(canHostSettings('/dashboard/notes')).toBe(true);
    expect(canHostSettings('/settings')).toBe(true);
  });

  it('is false anywhere without app chrome, so the caller goes to the dashboard instead', () => {
    expect(canHostSettings('/payment/callback')).toBe(false);
    expect(canHostSettings('/admin')).toBe(false);
    expect(canHostSettings('/locked')).toBe(false);
    expect(canHostSettings('/settingsfoo')).toBe(false);
    expect(canHostSettings(null)).toBe(false);
    expect(canHostSettings(undefined)).toBe(false);
  });
});

describe('isPlainLeftClick', () => {
  const click = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };

  it('intercepts an ordinary click', () => {
    expect(isPlainLeftClick(click)).toBe(true);
  });

  it('leaves new-tab and new-window clicks to the browser', () => {
    expect(isPlainLeftClick({ ...click, metaKey: true })).toBe(false);
    expect(isPlainLeftClick({ ...click, ctrlKey: true })).toBe(false);
    expect(isPlainLeftClick({ ...click, shiftKey: true })).toBe(false);
    expect(isPlainLeftClick({ ...click, altKey: true })).toBe(false);
  });

  it('leaves the middle and right buttons alone', () => {
    expect(isPlainLeftClick({ ...click, button: 1 })).toBe(false);
    expect(isPlainLeftClick({ ...click, button: 2 })).toBe(false);
  });

  it('does not fight a handler that already claimed the click', () => {
    expect(isPlainLeftClick({ ...click, defaultPrevented: true })).toBe(false);
  });
});

describe('settingsLeaveHref', () => {
  const base = 'https://app.urganize.app/dashboard?settings=menu';
  it('returns the path for a plain in-app link', () => {
    expect(settingsLeaveHref({ href: 'https://app.urganize.app/dashboard/press-kits' }, base)).toBe(
      '/dashboard/press-kits'
    );
    expect(settingsLeaveHref({ href: '/dashboard/home?x=1#a' }, base)).toBe('/dashboard/home?x=1#a');
  });
  it('leaves other tabs, downloads, other sites and settings links alone', () => {
    expect(settingsLeaveHref({ href: '/x', target: '_blank' }, base)).toBeNull();
    expect(settingsLeaveHref({ href: '/x', download: true }, base)).toBeNull();
    expect(settingsLeaveHref({ href: 'https://example.com/x' }, base)).toBeNull();
    expect(settingsLeaveHref({ href: '/dashboard?settings=team' }, base)).toBeNull();
  });
});
