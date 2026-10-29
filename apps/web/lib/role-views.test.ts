import { describe, expect, it } from 'vitest';
import { activeMobileTab, activeShellArea, buildMoreItems, buildShellAreas, type ShellArea, type ShellFlags } from './shell-nav';
import {
  ROLE_VIEWS,
  applyRoleView,
  automaticRoleView,
  describeRoleView,
  effectiveRoleView,
  isTucked,
  resolveRoleView,
  roleViewFromProfileRole,
  tuckedMoreItems,
  type RoleView,
} from './role-views';

const ALL_ON: ShellFlags = {
  notes: true,
  pitching: true,
  directory: true,
  artistPage: true,
  relationships: true,
  pressKits: true,
  opportunities: true,
};

const areas = () => buildShellAreas(ALL_ON);

/** Every destination a menu shows, as `area/tab` (or the area alone). */
function destinations(list: ShellArea[]): string[] {
  return list.flatMap((area) =>
    area.subTabs.length === 0 ? [area.key] : area.subTabs.map((tab) => `${area.key}/${tab.key}`)
  );
}

function view(v: RoleView) {
  return applyRoleView(areas(), v);
}

function more(list: ShellArea[]): string[] {
  return list.find((area) => area.key === 'more')?.subTabs.map((tab) => tab.key) ?? [];
}

describe('persona resolution', () => {
  it('maps every onboarding persona, legacy producer included', () => {
    expect(automaticRoleView({ onboarding_persona: 'music_manager' })).toBe('artist_manager');
    expect(automaticRoleView({ onboarding_persona: 'label_ar' })).toBe('label');
    expect(automaticRoleView({ onboarding_persona: 'independent_artist' })).toBe('solo_artist');
    expect(automaticRoleView({ onboarding_persona: 'artist_team' })).toBe('artist_team');
    expect(automaticRoleView({ onboarding_persona: 'other' })).toBe('other');
    expect(automaticRoleView({ onboarding_persona: 'producer_beatmaker' })).toBe('other');
  });

  it('prefers the persona over the stored role', () => {
    expect(automaticRoleView({ onboarding_persona: 'independent_artist', role: 'manager' })).toBe('solo_artist');
    expect(automaticRoleView({ onboarding_persona: 'label_ar', role: 'artist' })).toBe('label');
  });

  it('falls back from profiles.role when there is no persona answer', () => {
    expect(roleViewFromProfileRole('artist')).toBe('solo_artist');
    expect(roleViewFromProfileRole('artist-manager')).toBe('artist_manager');
    // Legacy 'manager' accounts get the Label view (founder, 2026-10-14).
    expect(roleViewFromProfileRole('manager')).toBe('label');
    expect(roleViewFromProfileRole('artist-team')).toBe('artist_team');
    expect(roleViewFromProfileRole('team-member')).toBe('artist_team');
    expect(roleViewFromProfileRole('viewer')).toBe('other');
    expect(roleViewFromProfileRole('curator')).toBe('other');
    expect(roleViewFromProfileRole(null)).toBe('other');
    expect(roleViewFromProfileRole(undefined)).toBe('other');
    expect(automaticRoleView({ onboarding_persona: null, role: 'manager' })).toBe('label');
    expect(automaticRoleView({ onboarding_persona: 'not-a-persona', role: 'artist' })).toBe('solo_artist');
  });

  it('gives no viewer the full app', () => {
    expect(automaticRoleView(null)).toBe('other');
    expect(resolveRoleView(undefined)).toBe('other');
  });

  it('uses the Settings override over the persona, and ignores a bad stored value', () => {
    expect(resolveRoleView({ onboarding_persona: 'label_ar', role_view: 'solo_artist' })).toBe('solo_artist');
    expect(resolveRoleView({ onboarding_persona: 'label_ar', role_view: 'other' })).toBe('other');
    expect(resolveRoleView({ onboarding_persona: 'label_ar', role_view: null })).toBe('label');
    expect(resolveRoleView({ onboarding_persona: 'label_ar', role_view: 'admin' })).toBe('label');
  });

  it('shows the full app whenever the flag is off', () => {
    expect(effectiveRoleView({ onboarding_persona: 'independent_artist' }, false)).toBe('other');
    expect(effectiveRoleView({ onboarding_persona: 'independent_artist' }, true)).toBe('solo_artist');
  });
});

describe('the defaults every view keeps', () => {
  it('never tucks Home, Rollouts, Tasks, Press kits, Pitching, Notes or UrgAns', () => {
    for (const v of ROLE_VIEWS) {
      for (const feature of ['home', 'rollouts', 'tasks', 'press_kits', 'pitching', 'notes', 'urgans'] as const) {
        expect(isTucked(v, feature)).toBe(false);
      }
      const shown = destinations(view(v).filter((area) => area.key !== 'more'));
      expect(shown).toEqual(
        expect.arrayContaining(['home', 'catalogue/releases', 'catalogue/notes'])
      );
    }
  });

  it('team assignment is tucked for a solo artist only', () => {
    expect(ROLE_VIEWS.filter((v) => isTucked(v, 'team'))).toEqual(['solo_artist']);
  });

  it('catalogue and credits are tucked for an artist manager and an artist team only', () => {
    for (const feature of ['catalogue', 'credits'] as const) {
      expect(ROLE_VIEWS.filter((v) => isTucked(v, feature))).toEqual(['artist_manager', 'artist_team']);
    }
  });
});

describe('the nav filter, per view', () => {
  it('Other is the full app, unchanged', () => {
    const input = areas();
    expect(applyRoleView(input, 'other')).toBe(input);
  });

  it('Artist manager tucks nothing now that Audience is off the nav (URG-319)', () => {
    const list = view('artist_manager');
    expect(list.map((a) => a.key)).toEqual(['home', 'urgans', 'catalogue', 'team', 'relationships', 'opportunities']);
    expect(destinations(list)).toContain('catalogue/artists');
    expect(destinations(list)).toContain('relationships/people');
  });

  it('Label tucks Opportunities', () => {
    const list = view('label');
    expect(list.map((a) => a.key)).toEqual(['home', 'urgans', 'catalogue', 'team', 'relationships', 'more']);
    expect(more(list)).toEqual(['opportunities']);
    const relationships = list.find((a) => a.key === 'relationships')!;
    expect(relationships.subTabs.map((t) => t.key)).toEqual(['directory', 'people']);
  });

  it('Solo artist tucks Artists, Team, Directory and People', () => {
    const list = view('solo_artist');
    expect(more(list)).toEqual(['artists', 'team', 'directory', 'people']);
    const catalogue = list.find((a) => a.key === 'catalogue')!;
    expect(catalogue.subTabs.map((t) => t.key)).toEqual(['releases', 'notes']);
    // Relationships lost every tab, so it moved under More whole.
    expect(list.some((a) => a.key === 'relationships')).toBe(false);
  });

  it('Artist team tucks Artists, People, Directory and Opportunities', () => {
    const list = view('artist_team');
    expect(list.map((a) => a.key)).toEqual(['home', 'urgans', 'catalogue', 'team', 'more']);
    expect(more(list)).toEqual(['artists', 'directory', 'people', 'opportunities']);
  });

  it('removes nothing: every destination is in the menu or under More', () => {
    const all = areas().flatMap((a) => (a.subTabs.length ? a.subTabs.map((t) => t.href) : [a.href]));
    for (const v of ROLE_VIEWS) {
      const list = view(v);
      const reachable = list.flatMap((a) => (a.subTabs.length ? a.subTabs.map((t) => t.href) : [a.href]));
      expect(new Set(reachable)).toEqual(new Set(all));
    }
  });

  it('a deep link to a tucked page lights More, not the area it came from', () => {
    const list = view('solo_artist');
    expect(activeShellArea(list, '/dashboard/artists')?.key).toBe('more');
    expect(activeShellArea(list, '/dashboard/artists/abc')?.key).toBe('more');
    expect(activeShellArea(list, '/dashboard/directory')?.key).toBe('more');
    expect(activeShellArea(list, '/dashboard')?.key).toBe('catalogue');
    expect(activeMobileTab(list, '/dashboard/artists')).toBe('more');
  });

  it("hands the phone's More sheet the tucked pages after the areas it already lists", () => {
    const list = view('label');
    expect(buildMoreItems(list).map((i) => i.key)).toEqual(['team', 'relationships']);
    expect(tuckedMoreItems(list)).toEqual([
      { key: 'opportunities', label: 'Opportunities', href: '/dashboard/opportunities', soon: false },
    ]);
    expect(tuckedMoreItems(view('artist_manager'))).toEqual([]);
    expect(tuckedMoreItems(view('other'))).toEqual([]);
  });

  it('tucks nothing that a flag already hid', () => {
    const flagsOff: ShellFlags = { ...ALL_ON, artistPage: false, directory: false };
    const list = applyRoleView(buildShellAreas(flagsOff), 'solo_artist');
    expect(more(list)).toEqual(['team', 'people']);
  });

  it('says what a view tucks in one line', () => {
    expect(describeRoleView('other')).toBe('Everything is in the menu.');
    expect(describeRoleView('label')).toBe('Opportunities move under More. Nothing is removed.');
  });
});
