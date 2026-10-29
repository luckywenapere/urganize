import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SETTINGS_SEGMENTS, settingsDeepLink, type SettingsRequest } from './settings-nav';
import { SETTINGS_SEARCH_ENTRIES } from './settings-search';
import { settingsStubTarget } from './settings-stub-target';

// /dashboard/settings had no route (the 404 with the pop-up drawn over it, and
// a dead page on reload). Both Settings paths are now the same redirect stub,
// and this is the map that stub follows.

const land = (search: string, hash = '') => settingsDeepLink(settingsStubTarget(search, hash));

describe('settingsStubTarget', () => {
  it('a bare path opens the menu (General on a wide screen)', () => {
    expect(settingsStubTarget('', '')).toEqual({ segment: 'menu', section: null });
    expect(land('')).toBe('/dashboard?settings=menu');
  });

  it.each(SETTINGS_SEGMENTS.map((segment) => [segment]))(
    '?settings=%s keeps its segment',
    (segment) => {
      expect(settingsStubTarget(`?settings=${segment}`, '')).toEqual({ segment, section: null });
      // Team is its own tab since #853; every other segment opens the pop-up.
      expect(land(`?settings=${segment}`)).toBe(segment === 'team' ? '/dashboard/team' : `/dashboard?settings=${segment}`);
    }
  );

  it('keeps the section with the segment', () => {
    expect(land('?settings=security&section=delete-rollouts')).toBe(
      '/dashboard?settings=security&section=delete-rollouts'
    );
  });

  it('works without the leading "?"', () => {
    expect(settingsStubTarget('settings=notifications', '').segment).toBe('notifications');
  });

  it('an unknown or empty ?settings= opens the menu, as it would on /dashboard', () => {
    expect(settingsStubTarget('?settings=nonsense', '').segment).toBe('menu');
    expect(settingsStubTarget('?settings=', '').segment).toBe('menu');
  });

  it('?settings= wins over a hash and an old ?tab=', () => {
    expect(settingsStubTarget('?settings=billing&tab=team', '#teammates')).toEqual({
      segment: 'billing',
      section: null,
    });
  });

  it('old /settings links still translate exactly as before', () => {
    expect(settingsStubTarget('', '#teammates')).toEqual({ segment: 'team', section: 'teammates' });
    expect(settingsStubTarget('?tab=workspace', '#brand-colors')).toEqual({
      segment: 'artists',
      section: 'brand-colors',
    });
    expect(settingsStubTarget('?tab=notifications', '')).toEqual({
      segment: 'notifications',
      section: null,
    });
  });

  it('a hash naming a section the pop-up can scroll to opens its segment', () => {
    expect(settingsStubTarget('', '#delete-rollouts')).toEqual({
      segment: 'security',
      section: 'delete-rollouts',
    });
    expect(land('', '#delete-account')).toBe('/dashboard?settings=security&section=delete-account');
  });

  it('every section id in the search index resolves to its own segment', () => {
    for (const entry of SETTINGS_SEARCH_ENTRIES) {
      if (!entry.section) continue;
      const target = settingsStubTarget('', `#${entry.section}`);
      expect(target.section).toBe(entry.section);
      // Legacy anchors keep their legacy mapping, which agrees with the index.
      expect(target.segment).toBe(entry.segment);
    }
  });

  it('an unknown hash opens the menu', () => {
    const valid: SettingsRequest[] = ['menu', ...SETTINGS_SEGMENTS];
    const target = settingsStubTarget('', '#nonsense');
    expect(valid).toContain(target.segment);
    expect(target).toEqual({ segment: 'menu', section: null });
  });

  it('always lands on /dashboard, where the pop-up is mounted (Team, its own tab since #853, aside)', () => {
    expect(land('?settings=team')).toBe('/dashboard/team');
    for (const [search, hash] of [
      ['', ''],
      ['', '#delete-rollouts'],
      ['?tab=account', ''],
    ]) {
      expect(land(search, hash).startsWith('/dashboard?settings=')).toBe(true);
    }
  });
});

describe('the /dashboard/settings route', () => {
  const APP = join(__dirname, '..', 'app');

  it('exists, so the path is not a 404', () => {
    expect(existsSync(join(APP, 'dashboard', 'settings', 'page.tsx'))).toBe(true);
  });

  it('is the same redirect stub as /settings, with a Settings title', () => {
    const page = readFileSync(join(APP, 'dashboard', 'settings', 'page.tsx'), 'utf8');
    expect(page).toMatch(/import SettingsRedirect from '@\/app\/settings\/SettingsRedirect'/);
    expect(page).toMatch(/title: 'Settings'/);
    const legacy = readFileSync(join(APP, 'settings', 'page.tsx'), 'utf8');
    expect(legacy).toMatch(/SettingsRedirect/);
  });

  it('the stub follows settingsStubTarget and replaces (so Back leaves)', () => {
    const stub = readFileSync(join(APP, 'settings', 'SettingsRedirect.tsx'), 'utf8');
    expect(stub).toMatch(/settingsStubTarget\(window\.location\.search, window\.location\.hash\)/);
    expect(stub).toMatch(/router\.replace\(/);
  });
});
