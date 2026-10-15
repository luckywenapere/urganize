import { describe, expect, it } from 'vitest';
import {
  activeMobileTab,
  activeShellArea,
  buildMobileTabs,
  buildMoreItems,
  buildShellAreas,
  visibleSubTabs,
  type ShellFlags,
} from './shell-nav';

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

describe('shell nav', () => {
  it('always offers the six areas in the strategy order (UrgAns after Home; Pitching lives inside each rollout)', () => {
    for (const flags of [ALL_ON, ALL_OFF]) {
      expect(buildShellAreas(flags).map((a) => a.key)).toEqual([
        'home',
        'urgans',
        'catalogue',
        'relationships',
        'opportunities',
        'audience',
      ]);
    }
  });

  it('marks areas with nothing built as not live, so their page says coming soon', () => {
    const areas = buildShellAreas(ALL_OFF);
    const live = Object.fromEntries(areas.map((a) => [a.key, a.live]));
    expect(live).toEqual({
      home: true,
      urgans: true,
      catalogue: true,
      relationships: false,
      opportunities: true,
      audience: false,
    });
  });

  it('opportunities is always live, audience is not built yet', () => {
    const areas = buildShellAreas(ALL_ON);
    expect(areas.find((a) => a.key === 'opportunities')?.live).toBe(true);
    expect(areas.find((a) => a.key === 'audience')?.live).toBe(false);
  });

  it('relationships always points at its own page, whichever tabs are built', () => {
    expect(buildShellAreas(ALL_ON).find((a) => a.key === 'relationships')?.href).toBe(
      '/dashboard/relationships'
    );
    expect(
      buildShellAreas({ ...ALL_OFF, pitching: true }).find((a) => a.key === 'relationships')?.href
    ).toBe('/dashboard/relationships');
    expect(buildShellAreas(ALL_OFF).find((a) => a.key === 'relationships')?.href).toBe(
      '/dashboard/relationships'
    );
  });

  it('catalogue always has Rollouts and adds only the tabs whose page opens', () => {
    const labels = (flags: ShellFlags) =>
      buildShellAreas(flags)
        .find((a) => a.key === 'catalogue')!
        .subTabs.map((t) => t.label);
    expect(labels(ALL_OFF)).toEqual(['Rollouts']);
    expect(labels(ALL_ON)).toEqual(['Rollouts', 'Artists', 'Notes']);
  });

  it('shows the sub-tab row only when there is a choice', () => {
    const areas = buildShellAreas(ALL_OFF);
    expect(visibleSubTabs(activeShellArea(areas, '/dashboard/home'))).toEqual([]);
    const on = buildShellAreas(ALL_ON);
    expect(visibleSubTabs(activeShellArea(on, '/dashboard')).length).toBe(3);
    expect(visibleSubTabs(null)).toEqual([]);
  });

  it('lights the right area for every route, and none for pages outside the six', () => {
    const areas = buildShellAreas(ALL_ON);
    const at = (p: string) => activeShellArea(areas, p)?.key ?? null;
    expect(at('/dashboard/home')).toBe('home');
    expect(at('/dashboard')).toBe('catalogue');
    expect(at('/dashboard/artists/abc')).toBe('catalogue');
    expect(at('/dashboard/press-kits')).toBe('catalogue');
    expect(at('/dashboard/distribute')).toBe('catalogue');
    expect(at('/dashboard/notes')).toBe('catalogue');
    expect(at('/dashboard/directory')).toBe('relationships');
    // A bridge into a rollout's Pitch tab, in no area of its own.
    expect(at('/dashboard/pitching')).toBeNull();
    expect(at('/dashboard/relationships/p1')).toBe('relationships');
    expect(at('/dashboard/opportunities')).toBe('opportunities');
    expect(at('/dashboard/audience')).toBe('audience');
    expect(at('/dashboard/shows/e1')).toBe('relationships');
    expect(at('/dashboard/urgans')).toBe('urgans');
    expect(at('/dashboard/credits')).toBeNull();
    expect(at('/settings')).toBeNull();
  });

  it('does not treat a longer path that merely starts with the same letters as a match', () => {
    const areas = buildShellAreas(ALL_ON);
    expect(activeShellArea(areas, '/dashboard/showsomething')).toBeNull();
    expect(activeShellArea(areas, '/dashboard/homepage')).toBeNull();
  });

  it('lights the matching sub-tab', () => {
    const area = buildShellAreas(ALL_ON).find((a) => a.key === 'catalogue')!;
    const lit = (p: string) => area.subTabs.filter((t) => t.isActive(p)).map((t) => t.key);
    expect(lit('/dashboard')).toEqual(['releases']);
    expect(lit('/dashboard/artists')).toEqual(['artists']);
    expect(lit('/dashboard/notes')).toEqual(['notes']);
  });

  it('phone bottom bar is Home, Catalogue, UrgAns; More holds the rest', () => {
    expect(buildMobileTabs().map((t) => t.key)).toEqual(['home', 'catalogue', 'urgans']);
    expect(buildMoreItems(buildShellAreas(ALL_ON)).map((i) => i.key)).toEqual([
      'relationships',
      'opportunities',
      'audience',
    ]);
  });

  it('flags unbuilt areas as soon in the More sheet', () => {
    const soon = Object.fromEntries(
      buildMoreItems(buildShellAreas(ALL_ON)).map((i) => [i.key, i.soon])
    );
    expect(soon).toEqual({ relationships: false, opportunities: false, audience: true });
  });

  it('lights More for an area the bar does not carry, UrgAns for its page', () => {
    const areas = buildShellAreas(ALL_ON);
    expect(activeMobileTab(areas, '/dashboard/home')).toBe('home');
    expect(activeMobileTab(areas, '/dashboard/artists')).toBe('catalogue');
    expect(activeMobileTab(areas, '/dashboard/shows')).toBe('more');
    expect(activeMobileTab(areas, '/dashboard/urgans')).toBe('urgans');
    expect(activeMobileTab(areas, '/dashboard/directory')).toBe('more');
    expect(activeMobileTab(areas, '/dashboard/audience')).toBe('more');
    expect(activeMobileTab(areas, '/settings')).toBe('more');
  });
});
