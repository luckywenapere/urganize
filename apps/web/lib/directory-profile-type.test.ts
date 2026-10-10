import { describe, expect, it } from 'vitest';
import { DIRECTORY_ROLES, type DirectoryRole } from './directory-roles';
import {
  EMPTY_LEAD_STATS,
  ROLE_GROUPS,
  canShowMessageButton,
  deriveProfileType,
  effectiveProfileType,
  leadItems,
  leadLine,
  leadsWithCredits,
  openToChoices,
  openToLabel,
  orderForViewer,
  viewerTypeFor,
  type ProfileType,
} from './directory-profile-type';

describe('deriveProfileType', () => {
  it('reads a manager role as a manager, even beside a creative one', () => {
    expect(deriveProfileType(['manager'])).toBe('manager');
    expect(deriveProfileType(['mix_engineer', 'manager'])).toBe('manager');
  });
  it('reads producers, designers and engineers as creatives', () => {
    expect(deriveProfileType(['producer'])).toBe('creative');
    expect(deriveProfileType(['graphic_designer', 'pr'])).toBe('creative');
  });
  it('reads curators, publicists and promoters as adjacent', () => {
    expect(deriveProfileType(['playlist_curator'])).toBe('adjacent');
    expect(deriveProfileType(['a_and_r', 'booking_agent'])).toBe('adjacent');
  });
  it('derives nothing from no roles, and never an artist', () => {
    expect(deriveProfileType([])).toBeNull();
    for (const role of DIRECTORY_ROLES) {
      expect(deriveProfileType([role])).not.toBe('artist');
    }
  });
  it('covers every role in exactly one place', () => {
    for (const role of DIRECTORY_ROLES as readonly DirectoryRole[]) {
      const inCreative = ROLE_GROUPS.creative.includes(role);
      const inAdjacent = ROLE_GROUPS.adjacent.includes(role);
      if (role === 'manager') {
        expect(inCreative || inAdjacent).toBe(false);
      } else {
        expect(Number(inCreative) + Number(inAdjacent)).toBe(1);
      }
    }
  });
});

describe('effectiveProfileType', () => {
  it('lets the owner override what the roles say', () => {
    expect(effectiveProfileType('artist', ['manager'])).toBe('artist');
  });
  it('ignores a stored value it does not know', () => {
    expect(effectiveProfileType('wizard', ['producer'])).toBe('creative');
    expect(effectiveProfileType(null, [])).toBeNull();
  });
});

describe('leadItems and leadLine', () => {
  const stats = { ...EMPTY_LEAD_STATS, rolloutsRun: 12, artistsManaged: 1, activeRollouts: 2 };
  it('leads a manager with rollouts run, artists and still active', () => {
    expect(leadLine('manager', stats)).toBe('12 rollouts run · 1 artist · 2 still active');
  });
  it('never prints a zero', () => {
    expect(leadLine('manager', { ...EMPTY_LEAD_STATS, rolloutsRun: 3 })).toBe('3 rollouts run');
    expect(leadItems('adjacent', EMPTY_LEAD_STATS)).toEqual([]);
  });
  it('leads an artist with releases and a team, but not a team of one', () => {
    expect(leadLine('artist', { ...EMPTY_LEAD_STATS, releases: 4, teamSize: 3 })).toBe(
      '4 releases · 3 people on the team'
    );
    expect(leadLine('artist', { ...EMPTY_LEAD_STATS, releases: 1, teamSize: 1 })).toBe('1 release');
  });
  it('leads an adjacent pro with rollouts worked on and shows', () => {
    expect(leadLine('adjacent', { ...EMPTY_LEAD_STATS, rolloutsWorkedOn: 5, shows: 1 })).toBe(
      '5 rollouts worked on · 1 show'
    );
  });
  it('leaves a creative to their delivered credits', () => {
    expect(leadItems('creative', stats)).toEqual([]);
    expect(leadsWithCredits('creative')).toBe(true);
    expect(leadsWithCredits('manager')).toBe(false);
  });
});

describe('openTo', () => {
  it("uses the type's own words for open", () => {
    expect(openToLabel('manager', 'open')).toBe('Taking new artists');
    expect(openToLabel('creative', 'open')).toBe('Open to hire');
    expect(openToLabel(null, 'open')).toBe('Open to hire');
  });
  it('says Not taking work for closed whatever the type', () => {
    for (const type of ['manager', 'artist', 'creative', 'adjacent', null] as const) {
      expect(openToLabel(type, 'closed')).toBe('Not taking work');
    }
  });
  it('offers two choices, and a third only to whoever already has it', () => {
    expect(openToChoices('manager', 'open').map((c) => c.value)).toEqual(['open', 'closed']);
    expect(openToChoices('manager', 'selective').map((c) => c.value)).toEqual([
      'open',
      'selective',
      'closed',
    ]);
  });
});

describe('canShowMessageButton', () => {
  const show = (
    targetType: ProfileType | null,
    availability: 'open' | 'selective' | 'closed',
    viewerType: ProfileType
  ) => canShowMessageButton({ targetType, availability, viewerType });

  it('shows an artist the button on an open manager only', () => {
    expect(show('manager', 'open', 'artist')).toBe(true);
    expect(show('manager', 'selective', 'artist')).toBe(false);
    expect(show('manager', 'closed', 'artist')).toBe(false);
  });
  it('does not show a manager the button on another manager', () => {
    expect(show('manager', 'open', 'manager')).toBe(false);
  });
  it('shows a manager the button on an open creative or adjacent pro', () => {
    expect(show('creative', 'open', 'manager')).toBe(true);
    expect(show('adjacent', 'open', 'manager')).toBe(true);
    expect(show(null, 'open', 'manager')).toBe(true);
    expect(show('creative', 'closed', 'manager')).toBe(false);
  });
  it('does not show an artist the button on a creative', () => {
    expect(show('creative', 'open', 'artist')).toBe(false);
  });
});

describe('viewerTypeFor', () => {
  it('uses their own profile type first', () => {
    expect(viewerTypeFor({ profileType: 'creative', accountRole: 'artist' })).toBe('creative');
  });
  it('reads an artist account as an artist and everyone else as a manager', () => {
    expect(viewerTypeFor({ profileType: null, accountRole: 'artist' })).toBe('artist');
    expect(viewerTypeFor({ profileType: null, accountRole: 'artist-manager' })).toBe('manager');
    expect(viewerTypeFor({ profileType: null, accountRole: undefined })).toBe('manager');
  });
});

describe('orderForViewer', () => {
  const people = [
    { id: 'c', profileType: 'creative' as const },
    { id: 'm1', profileType: 'manager' as const },
    { id: 'n', profileType: null },
    { id: 'a', profileType: 'adjacent' as const },
    { id: 'm2', profileType: 'manager' as const },
  ];
  it('puts managers first for an artist, keeping the server order inside a group', () => {
    expect(orderForViewer(people, 'artist').map((p) => p.id)).toEqual(['m1', 'm2', 'c', 'a', 'n']);
  });
  it('puts creatives and adjacent pros first for a manager', () => {
    expect(orderForViewer(people, 'manager').map((p) => p.id)).toEqual(['c', 'a', 'm1', 'm2', 'n']);
  });
  it('does not change the input', () => {
    const copy = [...people];
    orderForViewer(people, 'artist');
    expect(people).toEqual(copy);
  });
});
