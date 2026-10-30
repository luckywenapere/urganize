import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DASHBOARD_SECTIONS, artistHref, artistIdFromPath, recordHref } from './artist-page';
import { HOME_PATH, isHomeLocation } from './home-path';

// An artist's page sits straight under /dashboard (Oct 30, 2026, founder), so
// /dashboard/<x> is an artist unless x is one of the app's own pages. The list
// is read from the folders on disk, not typed out here, so a new page added
// under app/dashboard fails this test until it is named in DASHBOARD_SECTIONS.
const DASHBOARD_DIR = join(__dirname, '..', 'app', 'dashboard');

describe('the pages under /dashboard', () => {
  it('names every folder under app/dashboard, and nothing else', () => {
    const folders = readdirSync(DASHBOARD_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('[') && !entry.name.startsWith('('))
      .map((entry) => entry.name)
      .sort();
    expect([...DASHBOARD_SECTIONS].sort()).toEqual(folders);
  });

  it('has exactly one dynamic folder there, the artist page', () => {
    const dynamic = readdirSync(DASHBOARD_DIR).filter((name) => name.startsWith('['));
    expect(dynamic).toEqual(['[artistId]']);
  });
});

describe('artistIdFromPath', () => {
  it('reads the artist from an artist page and its records', () => {
    expect(artistIdFromPath('/dashboard/abc')).toBe('abc');
    expect(artistIdFromPath('/dashboard/abc/records/r1')).toBe('abc');
    expect(artistIdFromPath(artistHref('a/1'))).toBe('a/1');
    expect(artistIdFromPath(recordHref('a1', 'r1'))).toBe('a1');
  });

  it('is null for Home and for every page of the app', () => {
    expect(artistIdFromPath('/dashboard')).toBeNull();
    expect(artistIdFromPath('/dashboard/')).toBeNull();
    for (const section of DASHBOARD_SECTIONS) {
      expect(artistIdFromPath(`/dashboard/${section}`)).toBeNull();
      expect(artistIdFromPath(`/dashboard/${section}/x`)).toBeNull();
    }
    expect(artistIdFromPath('/settings')).toBeNull();
    expect(artistIdFromPath(null)).toBeNull();
  });
});

describe('isHomeLocation', () => {
  it('is Home at /dashboard with no rollout open', () => {
    expect(isHomeLocation(HOME_PATH)).toBe(true);
    expect(isHomeLocation('/dashboard/', '')).toBe(true);
    expect(isHomeLocation('/dashboard', '?settings=team')).toBe(true);
  });

  it('is not Home on a rollout, which shares the path', () => {
    expect(isHomeLocation('/dashboard', '?release=r1')).toBe(false);
    expect(isHomeLocation('/dashboard', 'scene=brief&release=r1')).toBe(false);
  });

  it('is not Home anywhere else', () => {
    expect(isHomeLocation('/dashboard/artists')).toBe(false);
    expect(isHomeLocation('/dashboard/abc')).toBe(false);
    expect(isHomeLocation('/dashboard/team')).toBe(false);
    expect(isHomeLocation(null)).toBe(false);
  });
});
