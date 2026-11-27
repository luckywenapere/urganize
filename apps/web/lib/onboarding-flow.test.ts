import { describe, expect, it } from 'vitest';
import { SINGLE_RELEASE_TEMPLATE } from './release-templates/single';
import {
  DEFAULT_MUSIC_FORM,
  DEFAULT_RELEASE_LEAD_DAYS,
  INVITE_POLL_LONG_WAIT_MS,
  INVITE_POLL_MS,
  INVITE_POLL_SLOW_MS,
  askInviteMessage,
  buildMusicSubmission,
  decideAfterJoin,
  decideAskBack,
  decideOnboardingScreen,
  decideOwnTeam,
  defaultMusicForm,
  defaultTeamName,
  describeMusicBlocker,
  describeTeamBlocker,
  invitePollDelay,
  inviteRoleLabel,
  isSystemTeamName,
  kindsForStage,
  musicPromise,
  musicSavesAs,
  parseInviteLink,
  parseOnboardingRecordBody,
  personaForWhoFor,
  resolveTeamName,
  shouldFollowLateTeamAnswer,
  teamStateForNewTeam,
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

  // #1412: 3 of 16 new accounts stopped on "Set up your team", so it is no
  // longer a step. The team is made for them and the project screen opens.
  it('no invite: the ask screen if they chose it last time, else the team is made for them', () => {
    expect(decideOnboardingScreen(state(), {})).toBe('make_team');
    expect(decideOnboardingScreen(state(), { lastChoice: 'ask' })).toBe('ask');
  });

  it('never answers with the team form', () => {
    const answers = [
      decideOnboardingScreen(state(), {}),
      decideOnboardingScreen(state(), { lastChoice: 'setup' }),
      // A team made for them last visit, never named by them: made again
      // (the server keeps it as it is), not shown as a form.
      decideOnboardingScreen(state({ ownTeam: { workspaceId: 't1', name: "Kemi's Team" } }), {}),
    ];
    expect(answers).toEqual(['make_team', 'make_team', 'make_team']);
  });

  it('a held account goes nowhere in the wizard', () => {
    expect(decideOnboardingScreen(state({ approved: false }), {})).toBe('held');
  });

  // The team form is only a stand-in now, shown when the check is slow (over 6
  // seconds) or fails. When the answer does arrive, it is followed, unless the
  // person has started on the form: then only an invite moves them.
  it('follows a late answer unless they have started on the stand-in form', () => {
    const invite = { workspaceId: 't1', teamName: 'Northline', inviterName: 'Tobi', role: 'member' as const, joined: false, invitedAt: '' };
    expect(shouldFollowLateTeamAnswer(state(), { formTouched: false })).toBe(true);
    expect(shouldFollowLateTeamAnswer(state(), { formTouched: true })).toBe(false);
    expect(shouldFollowLateTeamAnswer(state({ invites: [invite] }), { formTouched: true })).toBe(true);
    expect(shouldFollowLateTeamAnswer(state({ teamDecided: true }), { formTouched: false })).toBe(true);
  });

  it('"Create my own team" opens the project screen when the team was made this visit, else makes it', () => {
    expect(decideOwnTeam({ teamMade: true, hasTeamState: true })).toBe('music');
    expect(decideOwnTeam({ teamMade: false, hasTeamState: true })).toBe('make_team');
    // Made, but the team list was lost: make it again (safe) to get the list back.
    expect(decideOwnTeam({ teamMade: true, hasTeamState: false })).toBe('make_team');
  });

  it('Back on the ask screen returns to the screen it was opened from', () => {
    expect(decideAskBack({ openedFrom: 'music', teamMade: true, hasTeamState: true })).toBe('music');
    // A Manager who joined a team and looked at the ask screen is not given a team of their own by Back.
    expect(decideAskBack({ openedFrom: 'music', teamMade: false, hasTeamState: true })).toBe('music');
    expect(decideAskBack({ openedFrom: 'setup', teamMade: false, hasTeamState: false })).toBe('setup');
    // Opened by a reload (they chose to ask last visit): nothing behind it.
    expect(decideAskBack({ openedFrom: null, teamMade: false, hasTeamState: true })).toBe('make_team');
    expect(decideAskBack({ openedFrom: null, teamMade: true, hasTeamState: true })).toBe('music');
  });

  it('knows the name the system gives a team from a name somebody chose', () => {
    expect(isSystemTeamName("tunde.b's Team", 'Tunde.B@example.com')).toBe(true);
    expect(isSystemTeamName("  tunde.b's team ", 'tunde.b@example.com')).toBe(true);
    expect(isSystemTeamName("Team's Team", '')).toBe(true);
    expect(isSystemTeamName('Northline Music', 'tunde.b@example.com')).toBe(false);
    expect(isSystemTeamName("Tunde's Team", 'tunde.b@example.com')).toBe(false);
    expect(isSystemTeamName('', 'tunde.b@example.com')).toBe(false);
  });

  it('a team made a moment ago can open the project screen without another read', () => {
    const made = teamStateForNewTeam('t9', "Kemi's Team");
    expect(made.ownTeam).toEqual({ workspaceId: 't9', name: "Kemi's Team" });
    expect(made.teams).toEqual([
      { workspaceId: 't9', name: "Kemi's Team", role: 'owner', isOwn: true, canAdd: true, artists: [], rolloutCount: 0, rollouts: [] },
    ]);
    expect(made.primaryWorkspaceId).toBe('t9');
    expect(teamStateForNewTeam('t9', '  ').ownTeam?.name).toBe('My Team');
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

// #1412: 0 of 16 new accounts picked a release day. On a phone the question
// sits under the pinned Add it button with "No date yet" picked, so a rollout
// was saved with no date and no plan was built. The form now opens with a day.
describe('a release day is already picked', () => {
  const start = defaultMusicForm(TODAY);

  it('opens on Pick a day, 8 weeks from today', () => {
    expect(start.noDate).toBe(false);
    expect(start.date).toBe('2026-12-24');
    expect(DEFAULT_RELEASE_LEAD_DAYS).toBe(56);
    // Everything else is the blank form.
    expect({ ...start, noDate: true, date: '' }).toEqual(DEFAULT_MUSIC_FORM);
  });

  it('8 weeks is where the single plan starts, so no step lands in the past', () => {
    const earliest = Math.min(...SINGLE_RELEASE_TEMPLATE.tasks.map((task) => task.offset_days));
    expect(DEFAULT_RELEASE_LEAD_DAYS).toBe(-earliest);
  });

  it('crosses a month and a year end', () => {
    expect(defaultMusicForm('2026-11-27').date).toBe('2027-01-22');
    expect(defaultMusicForm('2028-01-05').date).toBe('2028-03-01');
  });

  it('Ready to release builds the plan with no more answers', () => {
    const ready = { ...start, stage: 'ready' as const, artist: 'Starlife' };
    expect(describeMusicBlocker(ready, TODAY)).toBe('');
    expect(musicPromise(ready)).toBe("We'll build your rollout plan, week by week.");
    expect(buildMusicSubmission(ready, TODAY)).toMatchObject({ savesAs: 'rollout', releaseDate: '2026-12-24' });
  });

  it('No date yet is still one tap away', () => {
    const noDate = { ...start, stage: 'ready' as const, artist: 'Starlife', noDate: true };
    expect(buildMusicSubmission(noDate, TODAY)).toMatchObject({ savesAs: 'rollout', releaseDate: null });
  });

  it('does not date music still being made, or music already out', () => {
    expect(buildMusicSubmission({ ...start, stage: 'recording', artist: 'Starlife' }, TODAY)).toMatchObject({ savesAs: 'record' });
    expect(buildMusicSubmission({ ...start, stage: 'out', artist: 'Starlife', outWhen: 'this_week' }, TODAY)).toMatchObject({
      releaseDate: '2026-10-26',
    });
  });

  it('falls back to the blank form when today is not a date', () => {
    expect(defaultMusicForm('')).toEqual(DEFAULT_MUSIC_FORM);
    // The right shape, but no such day: the blank form, never a throw.
    expect(defaultMusicForm('2026-13-45')).toEqual(DEFAULT_MUSIC_FORM);
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
