import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MUSIC_FORM,
  INVITE_POLL_LONG_WAIT_MS,
  INVITE_POLL_MS,
  INVITE_POLL_SLOW_MS,
  askInviteMessage,
  buildMusicSubmission,
  decideAfterJoin,
  decideOnboardingScreen,
  defaultTeamName,
  describeMusicBlocker,
  describeTeamBlocker,
  invitePollDelay,
  inviteRoleLabel,
  kindsForStage,
  musicPromise,
  musicSavesAs,
  parseInviteLink,
  parseOnboardingRecordBody,
  personaForWhoFor,
  resolveTeamName,
  type MusicForm,
  type OnboardingTeamState,
} from './onboarding-flow';

const TODAY = '2026-10-29';

function state(over: Partial<OnboardingTeamState> = {}): OnboardingTeamState {
  return {
    approved: true,
    completed: false,
    ownsWork: false,
    teamDecided: false,
    ownTeam: null,
    invites: [],
    teams: [],
    primaryWorkspaceId: null,
    ...over,
  };
}

function form(over: Partial<MusicForm> = {}): MusicForm {
  return { ...DEFAULT_MUSIC_FORM, ...over };
}

describe('team name', () => {
  it('suggests the first name, or My Team when there is none', () => {
    expect(defaultTeamName('Kemi Bello')).toBe("Kemi's Team");
    expect(defaultTeamName('  ')).toBe('My Team');
    expect(defaultTeamName(null)).toBe('My Team');
  });

  it('treats a blank name as the suggestion, never an error', () => {
    expect(resolveTeamName('   ', 'Kemi')).toBe("Kemi's Team");
    expect(resolveTeamName(' Northline Music ', 'Kemi')).toBe('Northline Music');
  });

  it('asks for who the team is for, and keeps names under 80 characters', () => {
    expect(describeTeamBlocker({ name: 'Northline', whoFor: null })).toBe('Pick who the team is for.');
    expect(describeTeamBlocker({ name: 'x'.repeat(81), whoFor: 'manager' })).toBe('Keep it under 80 characters.');
    expect(describeTeamBlocker({ name: '', whoFor: 'label' })).toBe('');
  });

  it('maps who the team is for onto the stored persona', () => {
    expect(personaForWhoFor('artist')).toBe('independent_artist');
    expect(personaForWhoFor('manager')).toBe('music_manager');
    expect(personaForWhoFor('label')).toBe('label_ar');
  });
});

describe('which screen a signed-in person sees (invite first)', () => {
  it('sends a finished account to the app', () => {
    expect(decideOnboardingScreen(state({ completed: true }), {})).toBe('done');
  });

  it('leaves an old account with work alone', () => {
    expect(decideOnboardingScreen(state({ ownsWork: true }), {})).toBe('done');
  });

  it('shows waiting invites before anything else', () => {
    const invites = [
      { workspaceId: 't1', teamName: 'Northline', inviterName: 'Tobi', role: 'member' as const, joined: false, invitedAt: '2026-10-28' },
    ];
    expect(decideOnboardingScreen(state({ invites }), {})).toBe('invites');
    // Even after choosing to ask last time: the invite has landed.
    expect(decideOnboardingScreen(state({ invites }), { lastChoice: 'ask' })).toBe('invites');
  });

  it('a decided team goes to the music screen, even with invites waiting', () => {
    const invites = [
      { workspaceId: 't1', teamName: 'Northline', inviterName: 'Tobi', role: 'member' as const, joined: false, invitedAt: '' },
    ];
    expect(decideOnboardingScreen(state({ teamDecided: true, invites }), {})).toBe('music');
  });

  it('no invite: the ask screen if they chose it last time, else set up a team', () => {
    expect(decideOnboardingScreen(state(), {})).toBe('setup');
    expect(decideOnboardingScreen(state(), { lastChoice: 'ask' })).toBe('ask');
  });

  it('a held account goes nowhere in the wizard', () => {
    expect(decideOnboardingScreen(state({ approved: false }), {})).toBe('held');
  });
});

describe('after joining a team', () => {
  it('managers and owners add music; everyone else goes to Home', () => {
    expect(decideAfterJoin('admin')).toBe('music');
    expect(decideAfterJoin('owner')).toBe('music');
    expect(decideAfterJoin('member')).toBe('home');
    expect(decideAfterJoin('guest')).toBe('home');
  });

  it('names the role in plain words', () => {
    expect(inviteRoleLabel('admin')).toBe('a manager');
    expect(inviteRoleLabel('member')).toBe('a team member');
    expect(inviteRoleLabel('member', true)).toBe('an artist');
    expect(inviteRoleLabel('guest')).toBe('a viewer');
  });
});

describe('ask to be invited', () => {
  it('writes the message with their email', () => {
    expect(askInviteMessage('kemi@x.com')).toBe(
      'Hi, please add me to our team on Urganize so I can see the plan. My email is kemi@x.com. In Urganize, go to Team, then Invite.'
    );
  });

  it('checks every 20 seconds, then every 2 minutes after half an hour', () => {
    expect(invitePollDelay(0)).toBe(INVITE_POLL_MS);
    expect(INVITE_POLL_MS).toBe(20_000);
    expect(invitePollDelay(INVITE_POLL_LONG_WAIT_MS - 1)).toBe(INVITE_POLL_MS);
    expect(invitePollDelay(INVITE_POLL_LONG_WAIT_MS)).toBe(INVITE_POLL_SLOW_MS);
    expect(INVITE_POLL_SLOW_MS).toBe(120_000);
  });

  it('reads the token out of a pasted invite link, and refuses anything else', () => {
    expect(parseInviteLink('https://my.urganize.app/invite/accept?token=abc-123')).toEqual({ token: 'abc-123' });
    expect(parseInviteLink('my.urganize.app/join/AbCd1234')).toEqual({ token: 'AbCd1234' });
    expect(parseInviteLink('  go.urganize.app/join/AbCd1234/  ')).toEqual({ token: 'AbCd1234' });
    expect(parseInviteLink('https://example.com/hello')).toBeNull();
    expect(parseInviteLink('')).toBeNull();
    expect(parseInviteLink('https://my.urganize.app/invite/accept')).toBeNull();
  });
});

describe('stage decides record or rollout', () => {
  it('early stages save as a record in the making, the rest as a rollout', () => {
    expect(musicSavesAs('idea')).toBe('record');
    expect(musicSavesAs('recording')).toBe('record');
    expect(musicSavesAs('mixing')).toBe('record');
    expect(musicSavesAs('ready')).toBe('rollout');
    expect(musicSavesAs('out')).toBe('rollout');
  });

  it('offers Not sure yet only for early stages', () => {
    expect(kindsForStage('idea')).toContain('unsure');
    expect(kindsForStage('ready')).not.toContain('unsure');
    expect(kindsForStage('out')).not.toContain('unsure');
  });
});

describe('the music form blocker, in order', () => {
  it('asks for the stage, then the artist', () => {
    expect(describeMusicBlocker(form(), TODAY)).toBe('Pick where it is now.');
    expect(describeMusicBlocker(form({ stage: 'idea' }), TODAY)).toBe('Add the artist.');
    expect(describeMusicBlocker(form({ stage: 'idea', artist: 'Starlife' }), TODAY)).toBe('');
  });

  it('Already out needs a when, and a day when Pick a day', () => {
    const base = form({ stage: 'out', artist: 'Starlife' });
    expect(describeMusicBlocker(base, TODAY)).toBe('Pick when it came out.');
    expect(describeMusicBlocker({ ...base, outWhen: 'day' }, TODAY)).toBe('Pick the day.');
    expect(describeMusicBlocker({ ...base, outWhen: 'day', outDay: '2026-10-01' }, TODAY)).toBe('');
    expect(describeMusicBlocker({ ...base, outWhen: 'this_week' }, TODAY)).toBe('');
  });

  it('Ready to release: no date is fine, a picked day must be today or later', () => {
    const base = form({ stage: 'ready', artist: 'Starlife' });
    expect(describeMusicBlocker({ ...base, noDate: true }, TODAY)).toBe('');
    expect(describeMusicBlocker({ ...base, noDate: false }, TODAY)).toBe('Pick the day, or choose No date yet.');
    expect(describeMusicBlocker({ ...base, noDate: false, date: '2026-10-01' }, TODAY)).toBe('That day has passed.');
    expect(describeMusicBlocker({ ...base, noDate: false, date: TODAY }, TODAY)).toBe('');
  });
});

describe('what the button promises', () => {
  it('follows the stage', () => {
    expect(musicPromise(form())).toBe('');
    expect(musicPromise(form({ stage: 'recording' }))).toBe(
      "We'll keep track of it while you make it. Pick a release day when you're ready."
    );
    expect(musicPromise(form({ stage: 'ready', noDate: true }))).toBe("We'll ask a few questions, then build your plan.");
    expect(musicPromise(form({ stage: 'ready', noDate: false, date: '2026-12-01' }))).toBe(
      "We'll build your rollout plan, week by week."
    );
    expect(musicPromise(form({ stage: 'out' }))).toBe("We'll build the plan for after the release.");
  });
});

describe('what Add it sends', () => {
  it('an idea becomes a record with one song at its stage', () => {
    expect(buildMusicSubmission(form({ stage: 'idea', artist: ' Starlife ', kind: 'single', name: '' }), TODAY)).toEqual({
      savesAs: 'record',
      artistName: 'Starlife',
      title: 'Untitled',
      kind: 'single',
      songTitle: 'Untitled',
      songStage: 'idea',
    });
  });

  it('a record that is not a single starts with Song 1, and Not sure yet stores no kind', () => {
    expect(buildMusicSubmission(form({ stage: 'mixing', artist: 'Starlife', kind: 'unsure', name: 'Gbedu' }), TODAY)).toEqual({
      savesAs: 'record',
      artistName: 'Starlife',
      title: 'Gbedu',
      kind: null,
      songTitle: 'Song 1',
      songStage: 'mixing',
    });
  });

  it('ready with a day builds the plan from that day; with none, no date', () => {
    expect(
      buildMusicSubmission(form({ stage: 'ready', artist: 'Starlife', kind: 'ep', name: 'Run', noDate: false, date: '2026-12-12' }), TODAY)
    ).toEqual({ savesAs: 'rollout', artistName: 'Starlife', title: 'Run', releaseType: 'ep', releaseDate: '2026-12-12' });
    expect(buildMusicSubmission(form({ stage: 'ready', artist: 'Starlife', noDate: true }), TODAY)).toEqual({
      savesAs: 'rollout',
      artistName: 'Starlife',
      title: '',
      releaseType: 'single',
      releaseDate: null,
    });
  });

  it('already out dates the rollout from the words when there is no exact day', () => {
    expect(buildMusicSubmission(form({ stage: 'out', artist: 'Starlife', outWhen: 'this_week' }), TODAY)).toMatchObject({
      releaseDate: '2026-10-26',
    });
    expect(buildMusicSubmission(form({ stage: 'out', artist: 'Starlife', outWhen: 'day', outDay: '2026-09-01' }), TODAY)).toMatchObject({
      releaseDate: '2026-09-01',
    });
  });

  it('refuses an unfinished form', () => {
    expect(buildMusicSubmission(form({ stage: 'ready' }), TODAY)).toBeNull();
  });
});

describe('the record body the server accepts', () => {
  it('keeps the stage, artist and kind, and fills the defaults', () => {
    expect(parseOnboardingRecordBody({ songStage: 'recording', artistName: ' Starlife ', kind: 'ep' })).toEqual({
      value: {
        workspaceId: null,
        artistId: null,
        artistName: 'Starlife',
        title: 'Untitled',
        kind: 'ep',
        songTitle: 'Song 1',
        songStage: 'recording',
      },
    });
  });

  it('refuses a rollout stage or no artist', () => {
    expect(parseOnboardingRecordBody({ songStage: 'ready', artistName: 'x' })).toEqual({ error: 'Pick where it is now.' });
    expect(parseOnboardingRecordBody({ songStage: 'idea' })).toEqual({ error: 'Add the artist.' });
  });

  it('ignores ids that are not ids', () => {
    const parsed = parseOnboardingRecordBody({ songStage: 'idea', artistName: 'A', workspaceId: 'x', artistId: '1' });
    expect('value' in parsed && parsed.value.workspaceId).toBeNull();
    expect('value' in parsed && parsed.value.artistId).toBeNull();
  });
});
