import { describe, expect, it } from 'vitest';
import {
  ADD_ARTIST_HREF,
  activeMobileTab,
  activeShellArea,
  buildMobileTabs,
  buildMoreItems,
  buildShellAreas,
  shellPageTitle,
  visibleSubTabs,
  type ShellFlags,
} from './shell-nav';

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

describe('shell nav', () => {
  it('offers Artists, UrgAns, Team (Home left Oct 29, 2026, #876; Audience cut Oct 16, 2026)', () => {
    expect(buildShellAreas(ALL_ON).map((a) => a.key)).toEqual([
      'catalogue',
      'urgans',
      'team',
      'relationships',
      'opportunities',
    ]);
  });

  it('drops Opportunities and parks Relationships while they are paused (Oct 27 and 29, 2026)', () => {
    expect(buildShellAreas(ALL_OFF).map((a) => a.key)).toEqual(['catalogue', 'urgans', 'team']);
    // Directory alone does not bring the Relationships pill back (#853).
    expect(buildShellAreas({ ...ALL_OFF, directory: true }).map((a) => a.key)).toEqual(['catalogue', 'urgans', 'team']);
    expect(buildMoreItems(buildShellAreas(ALL_OFF)).map((i) => i.key)).toEqual([]);
  });

  it('Team is one destination, lit on its page', () => {
    const areas = buildShellAreas(ALL_OFF);
    const team = areas.find((a) => a.key === 'team')!;
    expect(team.href).toBe('/dashboard/team');
    expect(team.subTabs).toEqual([]);
    expect(activeShellArea(areas, '/dashboard/team')?.key).toBe('team');
    expect(activeMobileTab(areas, '/dashboard/team')).toBe('team');
  });

  it('marks areas with nothing built as not live, so their page says coming soon', () => {
    const areas = buildShellAreas(ALL_OFF);
    const live = Object.fromEntries(areas.map((a) => [a.key, a.live]));
    expect(live).toEqual({
      urgans: true,
      catalogue: true,
      team: true,
    });
  });

  it('opportunities is live when on, and Audience is off the nav (URG-319)', () => {
    const areas = buildShellAreas(ALL_ON);
    expect(areas.find((a) => a.key === 'opportunities')?.live).toBe(true);
    expect(areas.find((a) => a.key === 'audience')).toBeUndefined();
  });

  it('relationships lands on Directory, then My People, and Shows is not a tab (URG-303)', () => {
    const rel = buildShellAreas(ALL_ON).find((a) => a.key === 'relationships')!;
    expect(rel.href).toBe('/dashboard/directory');
    expect(rel.subTabs.map((t) => t.label)).toEqual(['Directory', 'My People']);
    expect(
      buildShellAreas({ ...ALL_OFF, relationships: true }).find((a) => a.key === 'relationships')?.href
    ).toBe('/dashboard/relationships');
    expect(buildShellAreas(ALL_OFF).find((a) => a.key === 'relationships')).toBeUndefined();
  });

  it('catalogue always has Rollouts and adds only the tabs whose page opens', () => {
    const labels = (flags: ShellFlags) =>
      buildShellAreas(flags)
        .find((a) => a.key === 'catalogue')!
        .subTabs.map((t) => t.label);
    expect(labels(ALL_OFF)).toEqual(['Rollouts']);
    expect(labels(ALL_ON)).toEqual(['Artists', 'Rollouts', 'Notes']);
  });

  it('shows the sub-tab row only when there is a choice', () => {
    const areas = buildShellAreas(ALL_OFF);
    expect(visibleSubTabs(activeShellArea(areas, '/dashboard/team'))).toEqual([]);
    const on = buildShellAreas(ALL_ON);
    expect(visibleSubTabs(activeShellArea(on, '/dashboard')).length).toBe(3);
    expect(visibleSubTabs(null)).toEqual([]);
  });

  it('lights the right area for every route, and none for pages outside the six', () => {
    const areas = buildShellAreas(ALL_ON);
    const at = (p: string) => activeShellArea(areas, p)?.key ?? null;
    expect(at('/dashboard/home')).toBeNull();
    expect(at('/dashboard/team')).toBe('team');
    expect(at('/dashboard')).toBe('catalogue');
    expect(at('/dashboard/artists/abc')).toBe('catalogue');
    expect(at('/dashboard/distribute')).toBe('catalogue');
    expect(at('/dashboard/notes')).toBe('catalogue');
    expect(at('/dashboard/directory')).toBe('relationships');
    // A bridge into a rollout's Pitch tab, in no area of its own.
    expect(at('/dashboard/pitching')).toBeNull();
    expect(at('/dashboard/relationships/p1')).toBe('relationships');
    expect(at('/dashboard/opportunities')).toBe('opportunities');
    expect(at('/dashboard/audience')).toBeNull();
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

  it('gives each Artists-section tab its own action, drawn by the tab row (tab jump fix, Oct 18, 2026)', () => {
    const area = buildShellAreas(ALL_ON).find((a) => a.key === 'catalogue')!;
    const action = (key: string) => area.subTabs.find((t) => t.key === key)!.action;
    // Add artist opens Settings -> Artists & brand at its add field, over the
    // Artists page itself, so the tab under it does not change.
    expect(action('artists')).toEqual({ label: 'Add artist', href: ADD_ARTIST_HREF });
    const url = new URL(ADD_ARTIST_HREF, 'https://app.urganize.app');
    expect(url.pathname).toBe('/dashboard/artists');
    expect(url.searchParams.get('settings')).toBe('artists');
    expect(url.searchParams.get('section')).toBe('artists');
    expect(action('releases')).toEqual({ label: 'New rollout', press: 'openCreate' });
    // Notes keeps the slot's space with no button.
    expect(action('notes')).toBeNull();
    // With the artist page off, Rollouts alone still carries New rollout.
    const off = buildShellAreas(ALL_OFF).find((a) => a.key === 'catalogue')!;
    expect(off.subTabs.map((t) => t.action)).toEqual([{ label: 'New rollout', press: 'openCreate' }]);
  });

  it('phone bottom bar is Home, Assistant, Team (#876, #886); More holds the rest', () => {
    expect(buildMobileTabs().map((t) => t.key)).toEqual(['catalogue', 'urgans', 'team']);
    expect(buildMobileTabs().map((t) => t.label)).toEqual(['Home', 'Assistant', 'Team']);
    // The Artists tab lands on Artists when the artist page is on, Rollouts when it is off.
    expect(buildMobileTabs(buildShellAreas(ALL_ON))[0].href).toBe('/dashboard/artists');
    expect(buildMobileTabs(buildShellAreas(ALL_OFF))[0].href).toBe('/dashboard');
    // A role view that tucks Team leaves it off the bar.
    const noTeam = buildShellAreas(ALL_OFF).filter((a) => a.key !== 'team');
    expect(buildMobileTabs(noTeam).map((t) => t.key)).toEqual(['catalogue', 'urgans']);
    expect(buildMoreItems(buildShellAreas(ALL_ON)).map((i) => i.key)).toEqual([
      'relationships',
      'opportunities',
    ]);
  });

  it('flags unbuilt areas as soon in the More sheet', () => {
    const soon = Object.fromEntries(
      buildMoreItems(buildShellAreas(ALL_ON)).map((i) => [i.key, i.soon])
    );
    expect(soon).toEqual({ relationships: false, opportunities: false });
  });

  it('lights More for an area the bar does not carry, UrgAns for its page', () => {
    const areas = buildShellAreas(ALL_ON);
    expect(activeMobileTab(areas, '/dashboard/artists')).toBe('catalogue');
    expect(activeMobileTab(areas, '/dashboard/team')).toBe('team');
    expect(activeMobileTab(areas, '/dashboard/urgans')).toBe('urgans');
    expect(activeMobileTab(areas, '/dashboard/directory')).toBe('more');
    expect(activeMobileTab(areas, '/settings')).toBe('more');
  });
});
