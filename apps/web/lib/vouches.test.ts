import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  countRollouts,
  firstName,
  monthLabel,
  parseAssignment,
  parseVouch,
  skillFromActivity,
  suggestSkills,
  vouchSkills,
  workedTogetherLine,
} from './vouches';

const UUID = '3f2b8c1e-1d2a-4b3c-9d8e-7f6a5b4c3d2e';

describe('skillFromActivity', () => {
  it('reads the skill from the activity title', () => {
    expect(skillFromActivity({ title: 'Finalise cover art' })).toBe('Cover art');
    expect(skillFromActivity({ title: 'Send mix notes' })).toBe('Mixing');
    expect(skillFromActivity({ title: 'Master the single' })).toBe('Mastering');
    expect(skillFromActivity({ title: 'Shoot the music video' })).toBe('Video');
    expect(skillFromActivity({ title: 'Pitch to playlists' })).toBe('Playlist pitching');
    expect(skillFromActivity({ title: 'Write the press release' })).toBe('Press');
  });

  it('falls back to Events for a milestone, and to nothing otherwise', () => {
    expect(skillFromActivity({ title: 'Release day', taskType: 'event_milestone' })).toBe('Events');
    expect(skillFromActivity({ title: 'Check in with the team' })).toBeNull();
  });

  it('does not read a word inside another word', () => {
    expect(skillFromActivity({ title: 'Discover new fans' })).toBeNull();
    expect(skillFromActivity({ title: 'Masterclass prep' })).toBeNull();
  });
});

describe('suggestSkills', () => {
  it('puts the activity skill first, then On time and Easy to work with', () => {
    expect(suggestSkills({ title: 'Finalise cover art' })).toEqual(['Cover art', 'On time', 'Easy to work with']);
  });

  it("uses the person's role when the activity says nothing", () => {
    expect(suggestSkills({ title: 'Check in', role: 'photographer' })).toEqual([
      'Photographer',
      'On time',
      'Easy to work with',
    ]);
  });

  it('offers the two standing skills alone when there is nothing else', () => {
    expect(suggestSkills({ title: 'Check in' })).toEqual(['On time', 'Easy to work with']);
  });

  it('never repeats a chip', () => {
    expect(suggestSkills({ title: 'Check in', role: 'on time' })).toEqual(['On time', 'Easy to work with']);
  });
});

describe('firstName and monthLabel', () => {
  it('takes the first word of the name', () => {
    expect(firstName('Tobi Ade')).toBe('Tobi');
    expect(firstName('  Wiz  ')).toBe('Wiz');
  });

  it('formats a month in UTC', () => {
    expect(monthLabel('2026-10-01T00:30:00Z')).toBe('Oct 2026');
    expect(monthLabel('nope')).toBe('');
    expect(monthLabel(null)).toBe('');
  });
});

describe('parseAssignment', () => {
  it('takes a person id or null', () => {
    expect(parseAssignment({ personId: UUID })).toEqual({ value: { personId: UUID } });
    expect(parseAssignment({ personId: null })).toEqual({ value: { personId: null } });
    expect(parseAssignment({ personId: '' })).toEqual({ value: { personId: null } });
  });

  it('refuses anything else', () => {
    expect('error' in parseAssignment({})).toBe(true);
    expect('error' in parseAssignment({ personId: 'abc' })).toBe(true);
    expect('error' in parseAssignment(null)).toBe(true);
  });
});

describe('parseVouch', () => {
  it('needs a skill', () => {
    expect(parseVouch({})).toEqual({ error: 'Pick one.' });
    expect(parseVouch({ skill: '   ' })).toEqual({ error: 'Pick one.' });
  });

  it('keeps the note to 140 characters, and an empty note is none', () => {
    expect('error' in parseVouch({ skill: 'On time', note: 'x'.repeat(141) })).toBe(true);
    expect(parseVouch({ skill: 'On time', note: 'x'.repeat(140) })).toEqual({
      value: { skill: 'On time', note: 'x'.repeat(140), taskId: null },
    });
    expect(parseVouch({ skill: 'On time', note: '  ' })).toEqual({ value: { skill: 'On time', note: null, taskId: null } });
  });

  it('takes an activity id only in the right shape', () => {
    expect(parseVouch({ skill: 'On time', taskId: UUID })).toEqual({ value: { skill: 'On time', note: null, taskId: UUID } });
    expect('error' in parseVouch({ skill: 'On time', taskId: 'x' })).toBe(true);
  });
});

describe('Worked together', () => {
  const row = {
    taskId: 't1',
    releaseId: 'r1',
    artistName: 'Dorian',
    releaseTitle: 'Blue',
    activity: 'Cover art',
    when: '2026-10-05T10:00:00Z',
  };

  it('reads "Artist — Rollout · Activity · Mon YYYY"', () => {
    expect(workedTogetherLine(row)).toBe('Dorian — Blue · Cover art · Oct 2026');
  });

  it('leaves out empty parts', () => {
    expect(workedTogetherLine({ ...row, artistName: '', releaseTitle: '', releaseId: null, when: null })).toBe('Cover art');
  });

  it('counts rollouts, not activities', () => {
    expect(countRollouts([row, { ...row, taskId: 't2' }, { ...row, taskId: 't3', releaseId: 'r2' }, { ...row, releaseId: null }])).toBe(2);
  });
});

describe('vouchSkills', () => {
  it('lists each skill once, newest first', () => {
    expect(vouchSkills([{ skill: 'On time' }, { skill: 'Cover art' }, { skill: 'on time' }])).toEqual(['On time', 'Cover art']);
  });
});

describe('the flag', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const loadFlags = async () => import('./vouches');

  it('is off while Relationships is paused', async () => {
    vi.stubEnv('NEXT_PUBLIC_RELATIONSHIPS_UNPAUSED', '');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_RELATIONSHIPS', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_WORKSPACE', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_VOUCHES', '');
    expect((await loadFlags()).isVouchesEnabled()).toBe(false);
  });

  it('ships on, needs relationships and workspace, and only "false" turns it off', async () => {
    vi.stubEnv('NEXT_PUBLIC_RELATIONSHIPS_UNPAUSED', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_RELATIONSHIPS', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_WORKSPACE', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_VOUCHES', '');
    expect((await loadFlags()).isVouchesEnabled()).toBe(true);

    vi.stubEnv('NEXT_PUBLIC_FEATURE_VOUCHES', 'false');
    expect((await loadFlags()).isVouchesEnabled()).toBe(false);

    vi.stubEnv('NEXT_PUBLIC_FEATURE_VOUCHES', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_RELATIONSHIPS', 'false');
    expect((await loadFlags()).isVouchesEnabled()).toBe(false);
  });
});
