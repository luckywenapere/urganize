import { describe, expect, it } from 'vitest';
import { buildShellAreas, shellPageTitle, shellSideMenu, type ShellFlags } from './shell-nav';

const ALL_ON: ShellFlags = {
  notes: true,
  pitching: true,
  directory: true,
  artistPage: true,
  relationships: true,
  pressKits: true,
  opportunities: true,
};
const ALL_OFF: ShellFlags = {
  notes: false,
  pitching: false,
  directory: false,
  artistPage: false,
  relationships: false,
  pressKits: false,
  opportunities: false,
};

const labels = (path: string, flags: ShellFlags = ALL_ON) =>
  shellSideMenu(buildShellAreas(flags), path)?.pages.map((p) => p.label) ?? null;
const lit = (path: string, flags: ShellFlags = ALL_ON) =>
  shellSideMenu(buildShellAreas(flags), path)?.pages.filter((p) => p.active).map((p) => p.key) ?? null;

describe('the desktop side menu: the open area\u2019s pages (URG-254, founder call 2026-10-14)', () => {
  it('lists the Catalogue\u2019s pages as parents, the one on screen lit', () => {
    expect(labels('/dashboard')).toEqual(['Artists', 'Notes']);
    // Distribute left the menu (2026-10-15); its old page lights nothing.
    expect(lit('/dashboard/distribute')).toEqual([]);
    expect(lit('/dashboard')).toEqual(['artists']);
    expect(lit('/dashboard/abc')).toEqual(['artists']);
    expect(lit('/dashboard/artists')).toEqual(['artists']);
    expect(lit('/dashboard/notes')).toEqual(['notes']);
  });

  it('draws no Home side menu once Artists is its only page (Oct 30, 2026)', () => {
    expect(labels('/dashboard', { ...ALL_ON, notes: false })).toBeNull();
    expect(labels('/dashboard/abc', { ...ALL_ON, notes: false })).toBeNull();
  });

  it('lists Relationships\u2019 pages with the labels from shell-nav (no new words)', () => {
    expect(labels('/dashboard/directory')).toEqual(['Directory', 'My People']);
    expect(lit('/dashboard/directory')).toEqual(['directory']);
    expect(lit('/dashboard/relationships/p1')).toEqual(['people']);
  });

  it('draws no side menu for an area with one page, or a page in no area', () => {
    expect(labels('/dashboard/home')).toBeNull();
    expect(labels('/dashboard/pitching')).toBeNull();
    for (const path of ['/dashboard/urgans', '/dashboard/credits', '/settings']) {
      expect(labels(path)).toBeNull();
    }
  });

  it('keeps the Catalogue\u2019s menu with every flag off: Rollouts', () => {
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
    // Team left the menu for Settings (Nov 2, 2026); Rollouts took its place.
    expect(shellPageTitle(on, '/dashboard/sessions')).toBe('Rollouts');
    expect(shellPageTitle(on, '/dashboard/notes')).toBe('Notes');
    expect(shellPageTitle(on, '/dashboard')).toBe('Artists');
    expect(shellPageTitle(on, '/dashboard/pitching')).toBeNull();
    expect(shellPageTitle(buildShellAreas(ALL_OFF), '/dashboard')).toBe('Rollouts');
    expect(shellPageTitle(on, '/dashboard/distribute')).toBe('Home');
    expect(shellPageTitle(on, '/dashboard/urgans')).toBe('Assistant');
  });
});
