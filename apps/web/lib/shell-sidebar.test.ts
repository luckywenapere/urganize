import { describe, expect, it } from 'vitest';
import { buildShellAreas, shellPageTitle, shellSideMenu, type ShellFlags } from './shell-nav';

const ALL_ON: ShellFlags = {
  notes: true,
  events: true,
  pitching: true,
  directory: true,
  artistPage: true,
  relationships: true,
  pressKits: true,
};
const ALL_OFF: ShellFlags = {
  notes: false,
  events: false,
  pitching: false,
  directory: false,
  artistPage: false,
  relationships: false,
  pressKits: false,
};

const labels = (path: string, flags: ShellFlags = ALL_ON) =>
  shellSideMenu(buildShellAreas(flags), path)?.pages.map((p) => p.label) ?? null;
const lit = (path: string, flags: ShellFlags = ALL_ON) =>
  shellSideMenu(buildShellAreas(flags), path)?.pages.filter((p) => p.active).map((p) => p.key) ?? null;

describe('the desktop side menu: the open area\u2019s pages (URG-254, founder call 2026-10-14)', () => {
  it('lists the Catalogue\u2019s pages as parents, the one on screen lit', () => {
    expect(labels('/dashboard')).toEqual(['Rollouts', 'Artists', 'Press kits', 'Notes']);
    expect(lit('/dashboard')).toEqual(['releases']);
    expect(lit('/dashboard/artists')).toEqual(['artists']);
    expect(lit('/dashboard/notes')).toEqual(['notes']);
  });

  it('keeps Rollouts lit inside a rollout, where its menu nests', () => {
    expect(lit('/dashboard/releases/abc')).toEqual(['releases']);
  });

  it('lists Relationships\u2019 pages with the labels from shell-nav (no new words)', () => {
    expect(labels('/dashboard/directory')).toEqual(['People', 'Directory', 'Shows']);
    expect(lit('/dashboard/directory')).toEqual(['directory']);
    expect(lit('/dashboard/shows')).toEqual(['shows']);
  });

  it('draws no side menu for an area with one page, or a page in no area', () => {
    expect(labels('/dashboard/home')).toBeNull();
    expect(labels('/dashboard/pitching')).toBeNull();
    for (const path of ['/dashboard/urgans', '/dashboard/credits', '/settings']) {
      expect(labels(path)).toBeNull();
    }
  });

  it('keeps the Catalogue\u2019s menu even with Rollouts as its only page, for a rollout\u2019s menu', () => {
    expect(labels('/dashboard', ALL_OFF)).toEqual(['Rollouts']);
  });

  it('follows the flags, with no hardcoded list', () => {
    const on = buildShellAreas(ALL_ON);
    const catalogue = on.find((a) => a.key === 'catalogue');
    expect(shellSideMenu(on, '/dashboard')?.pages.map((p) => p.key)).toEqual(catalogue?.subTabs.map((t) => t.key));
  });
});

describe('the desktop page bar title', () => {
  it('names the page on screen, else the area, else nothing', () => {
    const on = buildShellAreas(ALL_ON);
    expect(shellPageTitle(on, '/dashboard/home')).toBe('Home');
    expect(shellPageTitle(on, '/dashboard/notes')).toBe('Notes');
    expect(shellPageTitle(on, '/dashboard')).toBe('Rollouts');
    expect(shellPageTitle(on, '/dashboard/pitching')).toBe('Pitching');
    expect(shellPageTitle(buildShellAreas(ALL_OFF), '/dashboard')).toBe('Catalogue');
    expect(shellPageTitle(on, '/dashboard/urgans')).toBeNull();
  });
});
