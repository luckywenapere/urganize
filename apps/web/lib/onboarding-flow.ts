/**
 * Onboarding: account, team, then the first music (#854, 29 Oct 2026, mocks
 * approved by Oyin). The flow and its copy are in docs/mocks/onboarding-team/
 * spec.md; this module holds the rules, pure, so vitest reaches them:
 *
 *  - which screen a signed-in person sees (an invite waiting comes first),
 *  - the team name and "Who is this team for?",
 *  - the ask-to-be-invited message and how often the page checks,
 *  - the New project form: stage first, what blocks Add it, what it promises,
 *    and whether it saves as a record in the making or a rollout.
 *
 * The screens are app/onboarding/OnboardingPageClient.tsx. The server side is
 * app/api/onboarding/* plus POST /api/releases (which now takes the team).
 */

import type { OnboardingPersona } from './onboarding';
import { outReleaseDate, type OutWhen } from './planner-v2/answers';

// ── Team ────────────────────────────────────────────────────────────────────

export type TeamWhoFor = 'artist' | 'manager' | 'label';

export const TEAM_WHO_FOR_OPTIONS: ReadonlyArray<{ value: TeamWhoFor; label: string }> = [
  { value: 'artist', label: "Just me, I'm the artist" },
  { value: 'manager', label: 'Artists I manage' },
  { value: 'label', label: 'A label' },
];

export const isTeamWhoFor = (value: unknown): value is TeamWhoFor =>
  value === 'artist' || value === 'manager' || value === 'label';

/** Stored as the onboarding persona, so profiles.role and the plan on the trial sheet follow. */
export function personaForWhoFor(whoFor: TeamWhoFor): OnboardingPersona {
  if (whoFor === 'artist') return 'independent_artist';
  if (whoFor === 'label') return 'label_ar';
  return 'music_manager';
}

export function whoForFromPersona(persona: string | null | undefined): TeamWhoFor | null {
  if (persona === 'independent_artist') return 'artist';
  if (persona === 'label_ar') return 'label';
  if (persona === 'music_manager' || persona === 'artist_team') return 'manager';
  return null;
}

/** The existing server limit on a team name. */
export const MAX_TEAM_NAME_LENGTH = 80;

export function firstNameOf(name: string | null | undefined): string {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

/** "{First name}'s Team", or "My Team" when Google gave no name. */
export function defaultTeamName(name: string | null | undefined): string {
  const first = firstNameOf(name);
  return first ? `${first}'s Team` : 'My Team';
}

/** A blank name is never an error: it takes the suggestion. */
export function resolveTeamName(input: string, name: string | null | undefined): string {
  return input.trim() || defaultTeamName(name);
}

/**
 * Is this the name the system gives a team nobody has named, "{email handle}'s
 * Team" (createWorkspaceName in lib/tasks-server.ts, used when any request makes
 * the team before onboarding does)? The team made for a new account (#1412)
 * replaces only this name, never one somebody chose.
 */
export function isSystemTeamName(teamName: string, email: string | null | undefined): boolean {
  const handle = String(email || '').trim().split('@')[0] || 'Team';
  return teamName.trim().toLowerCase() === `${handle}'s team`.toLowerCase();
}

export function describeTeamBlocker(input: { name: string; whoFor: TeamWhoFor | null }): string {
  if (input.name.trim().length > MAX_TEAM_NAME_LENGTH) return 'Keep it under 80 characters.';
  if (!input.whoFor) return 'Pick who the team is for.';
  return '';
}

// ── Team state (GET /api/onboarding/team-state) ─────────────────────────────

/** workspace_members.role. Manager is 'admin', Viewer is 'guest'. */
export type TeamRole = 'owner' | 'admin' | 'member' | 'guest';

export const isTeamRole = (value: unknown): value is TeamRole =>
  value === 'owner' || value === 'admin' || value === 'member' || value === 'guest';

export type TeamInvite = {
  workspaceId: string;
  teamName: string;
  inviterName: string;
  role: TeamRole;
  /** True for an artist-scoped membership: they were invited as the artist. */
  artistScoped?: boolean;
  /** Already an active member (an email invite the app claimed by itself). Join only confirms. */
  joined: boolean;
  invitedAt: string;
};

export type TeamRollout = {
  id: string;
  title: string;
  artistName: string;
  releaseType: string;
  releaseDate: string | null;
};

export type TeamSummary = {
  workspaceId: string;
  name: string;
  role: TeamRole;
  isOwn: boolean;
  /** Owners, managers and team members may add music; viewers may not. */
  canAdd: boolean;
  artists: Array<{ id: string; name: string }>;
  rolloutCount: number;
  rollouts: TeamRollout[];
};

export type OnboardingTeamState = {
  /** False for a held account (closed sign-up). */
  approved: boolean;
  completed: boolean;
  /** Owns rollouts, or its team has records: an old account to leave alone. */
  ownsWork: boolean;
  /** A team was named on the team screen (the persona is set). */
  teamDecided: boolean;
  ownTeam: { workspaceId: string; name: string } | null;
  invites: TeamInvite[];
  teams: TeamSummary[];
  primaryWorkspaceId: string | null;
};

/**
 * `make_team` is not a screen: the page makes the team ("{First name}'s Team")
 * and opens the project screen (#1412).
 */
export type OnboardingScreen = 'done' | 'held' | 'invites' | 'make_team' | 'ask' | 'music';

/**
 * Which screen a signed-in person sees. An invite waiting for their email
 * comes first, because joining the team that already exists beats starting
 * a new one (the bug this flow fixes: invited people ending up in an empty
 * team of their own).
 *
 * With no invite, the team is made for them (#1412, 27 Nov 2026, Oyin approved
 * docs/mocks/first-rollout-1412). "Set up your team" used to be the answer
 * here, and 3 of 16 new accounts stopped on it. It is never the answer now:
 * the page keeps that screen only for when this check cannot be made.
 */
export function decideOnboardingScreen(
  state: OnboardingTeamState,
  memory: { lastChoice?: 'ask' | 'setup' | null }
): OnboardingScreen {
  if (!state.approved) return 'held';
  if (state.completed) return 'done';
  if (state.teamDecided) return 'music';
  if (state.ownsWork) return 'done';
  if (state.invites.length > 0) return 'invites';
  if (memory.lastChoice === 'ask') return 'ask';
  return 'make_team';
}

/**
 * The team form is a stand-in since #1412: it shows only while the invite check
 * is slow (over 6 seconds) or has failed. When the answer does arrive it is
 * followed (an invite, the project screen, the app), so a slow phone does not
 * end up on the screen that was taken out of sign-up. The one exception: a
 * person who has started on the form is left to finish it, unless an invite is
 * waiting, which always wins.
 */
export function shouldFollowLateTeamAnswer(state: OnboardingTeamState, form: { formTouched: boolean }): boolean {
  return state.invites.length > 0 || !form.formTouched;
}

/**
 * "Create a team" on the invite screen and "Create my own team instead" on the
 * ask screen: straight to the project screen when the team was made in this
 * visit and its team list is at hand, else make it first (safe to repeat).
 */
export function decideOwnTeam(input: { teamMade: boolean; hasTeamState: boolean }): 'music' | 'make_team' {
  return input.teamMade && input.hasTeamState ? 'music' : 'make_team';
}

/**
 * Back on the ask screen goes to the screen the ask was opened from. Opened by
 * a reload (they chose to ask last visit) there is nothing behind it, so Back
 * is the same as "Create my own team instead".
 */
export function decideAskBack(input: {
  openedFrom: 'music' | 'setup' | null;
  teamMade: boolean;
  hasTeamState: boolean;
}): 'music' | 'setup' | 'make_team' {
  if (input.openedFrom === 'music' && input.hasTeamState) return 'music';
  if (input.openedFrom === 'setup') return 'setup';
  return decideOwnTeam(input);
}

/**
 * What the project screen needs to know about a team made a moment ago, for
 * when neither the make-team answer nor a re-read brought the real state
 * (bad data on a phone). A new team has no artists and no rollouts, so this is
 * true for the first visit; a later read replaces it.
 */
export function teamStateForNewTeam(workspaceId: string, name: string): OnboardingTeamState {
  const teamName = name.trim() || 'My Team';
  return {
    approved: true,
    completed: false,
    ownsWork: false,
    teamDecided: false,
    ownTeam: { workspaceId, name: teamName },
    invites: [],
    teams: [
      { workspaceId, name: teamName, role: 'owner', isOwn: true, canAdd: true, artists: [], rolloutCount: 0, rollouts: [] },
    ],
    primaryWorkspaceId: workspaceId,
  };
}

/** Managers (and owners) add music in the team they joined; everyone else lands on Home. */
export function decideAfterJoin(role: TeamRole): 'music' | 'home' {
  return role === 'owner' || role === 'admin' ? 'music' : 'home';
}

export function inviteRoleLabel(role: TeamRole, artistScoped = false): string {
  if (role === 'admin' || role === 'owner') return 'a manager';
  if (role === 'guest') return 'a viewer';
  return artistScoped ? 'an artist' : 'a team member';
}

// ── Ask to be invited ───────────────────────────────────────────────────────

export function askInviteMessage(email: string): string {
  return `Hi, please add me to our team on Urganize so I can see the plan. My email is ${email}. In Urganize, go to Team, then Invite.`;
}

export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** Light on data: every 20 seconds while the page is visible. */
export const INVITE_POLL_MS = 20_000;
/** After 30 minutes on the screen, the line changes and checking slows down. */
export const INVITE_POLL_LONG_WAIT_MS = 30 * 60 * 1000;
export const INVITE_POLL_SLOW_MS = 2 * 60 * 1000;

export function invitePollDelay(waitedMs: number): number {
  return waitedMs >= INVITE_POLL_LONG_WAIT_MS ? INVITE_POLL_SLOW_MS : INVITE_POLL_MS;
}

/**
 * The token in a pasted invite link: /invite/accept?token=… or /join/<code>.
 * Null for anything that is not one of ours. The server still checks the
 * token itself; this only finds it.
 */
export function parseInviteLink(raw: string): { token: string } | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!/(^|\.)urganize\.app$/i.test(url.hostname) && url.hostname !== 'localhost') return null;
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '/invite/accept') {
    const token = (url.searchParams.get('token') || '').trim();
    return token && token.length <= 512 ? { token } : null;
  }
  const join = /^\/join\/([A-Za-z0-9]{8,24})$/.exec(path);
  return join ? { token: join[1] } : null;
}

// ── New project ─────────────────────────────────────────────────────────────

/**
 * The project screen's heading (#1412; it was "Nothing here yet." while a team
 * step came before it). Shared with the loading screen in front of it, so the
 * heading does not change when the form arrives.
 */
export const NEW_PROJECT_HEADING = 'What are you working on?';

export type MusicStage ='idea' | 'recording' | 'mixing' | 'ready' | 'out';
export type MusicKind = 'single' | 'ep' | 'album' | 'unsure';
export type MusicOutWhen = OutWhen | 'day';

export const MUSIC_STAGES: ReadonlyArray<{ value: MusicStage; label: string; line: string; stamp: string }> = [
  { value: 'idea', label: 'Just an idea', line: 'No date. Nothing recorded yet.', stamp: 'Idea' },
  { value: 'recording', label: 'Recording', line: 'In the studio.', stamp: 'Recording' },
  { value: 'mixing', label: 'Mixing or mastering', line: 'Recorded, being finished.', stamp: 'Mixing' },
  { value: 'ready', label: 'Ready to release', line: 'Mastered. Time to plan the release.', stamp: 'Ready' },
  { value: 'out', label: 'Already out', line: 'Keep it going after release day.', stamp: 'Out' },
];

export const MUSIC_KIND_LABELS: Record<MusicKind, string> = {
  single: 'Single',
  ep: 'EP',
  album: 'Album',
  unsure: 'Not sure yet',
};

export const MUSIC_OUT_WHEN_OPTIONS: ReadonlyArray<{ value: MusicOutWhen; label: string }> = [
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'earlier', label: 'Earlier' },
  { value: 'day', label: 'Pick a day' },
];

const EARLY_STAGES: ReadonlySet<MusicStage> = new Set(['idea', 'recording', 'mixing']);

export const isEarlyStage = (stage: MusicStage | null): boolean => stage !== null && EARLY_STAGES.has(stage);

/**
 * Founder decision, 29 Oct: unfinished music is a record in the making (kept
 * out of `releases`, so rollout counts, the Solo limit and the scoreboard stay
 * true); Ready to release and Already out are rollouts.
 */
export function musicSavesAs(stage: MusicStage): 'record' | 'rollout' {
  return isEarlyStage(stage) ? 'record' : 'rollout';
}

/** "Not sure yet" only while the music is still being made. */
export function kindsForStage(stage: MusicStage | null): MusicKind[] {
  return stage === null || isEarlyStage(stage) ? ['single', 'ep', 'album', 'unsure'] : ['single', 'ep', 'album'];
}

export type MusicForm = {
  stage: MusicStage | null;
  artist: string;
  kind: MusicKind;
  name: string;
  /** Ready to release: "No date yet" (true) or "Pick a day" (false). */
  noDate: boolean;
  date: string;
  outWhen: MusicOutWhen | null;
  outDay: string;
};

/** The blank form. The screen opens on defaultMusicForm, which also picks a day. */
export const DEFAULT_MUSIC_FORM: MusicForm = {
  stage: null,
  artist: '',
  kind: 'single',
  name: '',
  noDate: true,
  date: '',
  outWhen: null,
  outDay: '',
};

const isYmd = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * How far out the release day is that the form opens with: 8 weeks, which is
 * where the single plan starts (the earliest step in release-templates/single
 * is 56 days before release day; onboarding-flow.test.ts holds the two together).
 */
export const DEFAULT_RELEASE_LEAD_DAYS = 56;


/**
 * The form a new project opens with (#1412, 27 Nov 2026): "Pick a day" is on
 * and the day is filled in, 8 weeks from today. Before this the form opened on
 * "No date yet", the question sat under the pinned Add it button on a phone,
 * and 0 of 16 new accounts picked a day, so nobody got a plan straight away.
 * The day only counts for Ready to release; "No date yet" is still one tap.
 */
export function defaultMusicForm(todayYmd: string): MusicForm {
  // The right shape is not enough ("2026-13-45"): the day has to exist.
  const today = isYmd(todayYmd) ? Date.parse(`${todayYmd}T00:00:00Z`) : NaN;
  if (!Number.isFinite(today)) return DEFAULT_MUSIC_FORM;
  const date = new Date(today + DEFAULT_RELEASE_LEAD_DAYS * 86_400_000).toISOString().slice(0, 10);
  return { ...DEFAULT_MUSIC_FORM, noDate: false, date };
}

/** What Add it is waiting for, in the spec's order. Empty when it can go. */
export function describeMusicBlocker(form: MusicForm, todayYmd: string): string {
  if (!form.stage) return 'Pick where it is now.';
  if (!form.artist.trim()) return 'Add the artist.';
  if (form.stage === 'out') {
    if (!form.outWhen) return 'Pick when it came out.';
    if (form.outWhen === 'day' && !isYmd(form.outDay)) return 'Pick the day.';
  }
  if (form.stage === 'ready' && !form.noDate) {
    if (!isYmd(form.date)) return 'Pick the day, or choose No date yet.';
    if (form.date < todayYmd) return 'That day has passed.';
  }
  return '';
}

/** The one line under Add it. */
export function musicPromise(form: MusicForm): string {
  if (!form.stage) return '';
  if (isEarlyStage(form.stage)) return "We'll keep track of it while you make it. Pick a release day when you're ready.";
  if (form.stage === 'ready') {
    return form.noDate || !isYmd(form.date)
      ? "We'll ask a few questions, then build your plan."
      : "We'll build your rollout plan, week by week.";
  }
  return "We'll build the plan for after the release.";
}

export const DEFAULT_MUSIC_TITLE = 'Untitled';

export type MusicSubmission =
  | {
      savesAs: 'record';
      artistName: string;
      title: string;
      /** Null for Not sure yet. */
      kind: 'single' | 'ep' | 'album' | null;
      songTitle: string;
      songStage: 'idea' | 'recording' | 'mixing';
    }
  | {
      savesAs: 'rollout';
      artistName: string;
      /** Empty lets the rollout take its own default title. */
      title: string;
      releaseType: 'single' | 'ep' | 'album';
      releaseDate: string | null;
    };

/** What Add it sends, or null when the form is not finished. */
export function buildMusicSubmission(form: MusicForm, todayYmd: string): MusicSubmission | null {
  if (describeMusicBlocker(form, todayYmd) || !form.stage) return null;
  const artistName = form.artist.trim().slice(0, 120);
  const name = form.name.trim().slice(0, 140);
  if (isEarlyStage(form.stage)) {
    const kind = form.kind === 'unsure' ? null : form.kind;
    const title = name || DEFAULT_MUSIC_TITLE;
    return {
      savesAs: 'record',
      artistName,
      title,
      kind,
      songTitle: kind === 'single' ? title : 'Song 1',
      songStage: form.stage as 'idea' | 'recording' | 'mixing',
    };
  }
  const releaseType = form.kind === 'unsure' ? 'single' : form.kind;
  let releaseDate: string | null = null;
  if (form.stage === 'ready') releaseDate = form.noDate ? null : form.date;
  if (form.stage === 'out') {
    releaseDate =
      form.outWhen === 'day' ? form.outDay : outReleaseDate((form.outWhen as OutWhen | null) ?? null, todayYmd);
  }
  return { savesAs: 'rollout', artistName, title: name, releaseType, releaseDate };
}

// ── POST /api/onboarding/music body ─────────────────────────────────────────

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OnboardingRecordBody = {
  workspaceId: string | null;
  artistId: string | null;
  artistName: string;
  title: string;
  kind: 'single' | 'ep' | 'album' | null;
  songTitle: string;
  songStage: 'idea' | 'recording' | 'mixing';
};

/** Validates what New project sends for unfinished music. */
export function parseOnboardingRecordBody(raw: unknown): { value: OnboardingRecordBody } | { error: string } {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const stage = body.songStage;
  if (stage !== 'idea' && stage !== 'recording' && stage !== 'mixing') return { error: 'Pick where it is now.' };
  const artistName = str(body.artistName, 120);
  const artistId = typeof body.artistId === 'string' && UUID_SHAPE.test(body.artistId) ? body.artistId : null;
  if (!artistName && !artistId) return { error: 'Add the artist.' };
  const kind = body.kind === 'single' || body.kind === 'ep' || body.kind === 'album' ? body.kind : null;
  const workspaceId = typeof body.workspaceId === 'string' && UUID_SHAPE.test(body.workspaceId) ? body.workspaceId : null;
  const title = str(body.title, 140) || DEFAULT_MUSIC_TITLE;
  const songTitle = str(body.songTitle, 140) || (kind === 'single' ? title : 'Song 1');
  return { value: { workspaceId, artistId, artistName, title, kind, songTitle, songStage: stage } };
}
