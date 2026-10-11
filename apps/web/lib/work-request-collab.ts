import type { LimitVerdict } from './entitlements';

/**
 * What happens when somebody says yes to a request. Pure: the I/O half is
 * lib/work-request-collab-server.ts, and the answer route is its only caller.
 *
 * THE MODEL, decided by reading the artist, workspace and membership code, and
 * the least invasive one that works:
 *
 * ARTIST TO MANAGER. The manager's TEAM is where the shared rollout lives, so
 * the artist is added to that team as an ARTIST-SCOPED teammate: role `member`,
 * `artist_scope_id` set to a roster artist named for them. That mechanism has
 * existed since 2026-07-23 and already means "sees only that artist's
 * rollouts", so the artist sees the one shared rollout and nothing else, and no
 * new access rule is invented. A rollout is created under that artist on the
 * manager's team. Nothing is moved across teams: an artist's own rollout in
 * their own team stays exactly where it is.
 *
 * It costs the manager's team a seat, an artist slot and an active-rollout
 * slot, each through the SAME check the invite and create routes use, so a Solo
 * team (one seat, held by the owner) is refused with the plain message those
 * routes already give. Refusing leaves the request waiting, so the manager can
 * upgrade and say yes, or pass.
 *
 * MANAGER TO CREW. A freelancer on one activity gets NO seat and NO access.
 * `guest` is the only role that would fit, and a guest still occupies a seat
 * (every seat count is "not removed"), so it would charge a team for a one-job
 * stranger. The person is recorded on the activity instead
 * (tasks.assigned_person_id) and the sender gets their contact the moment they
 * say yes, which is how the work actually starts.
 */

export type ShareBlockCode =
  | 'not_team_manager'
  | 'scoped_elsewhere'
  | 'seat_limit'
  | 'artist_limit'
  | 'rollout_limit';

export type ShareBlock = { code: ShareBlockCode; message: string };

export type SharePlan =
  | { ok: true; addMember: boolean; createArtist: boolean }
  | { ok: false; block: ShareBlock };

/** What to say after a ceiling message: the existing messages name the plan and
 *  what it holds, and a person who cannot act on them needs the next step. */
const NEXT_STEP = 'Upgrade to add them, or pass on this one.';

const ceilingMessage = (verdict: LimitVerdict): string => {
  const base = 'message' in verdict && typeof verdict.message === 'string' ? verdict.message : '';
  return base ? `${base} ${NEXT_STEP}` : NEXT_STEP;
};

export function decideSharedRollout(input: {
  /** The acceptor's role on their team. Null: no team resolved. */
  teamRole: string | null;
  /** The artist's membership on that team, when they already have one. */
  existingMember: { scopeArtistId: string | null } | null;
  /** The roster artist that already stands for this person, if any. */
  rosterArtistId: string | null;
  /** Null means the check could not be made, which fails OPEN like every other
   *  ceiling here: refusing a yes over a database blip is the worse mistake. */
  seats: LimitVerdict | null;
  artists: LimitVerdict | null;
  releases: LimitVerdict | null;
}): SharePlan {
  if (input.teamRole !== 'owner' && input.teamRole !== 'admin') {
    return {
      ok: false,
      block: {
        code: 'not_team_manager',
        message: 'Only a team owner or admin can take someone on. Pass on this one, or ask your owner.',
      },
    };
  }

  const member = input.existingMember;
  if (member?.scopeArtistId && member.scopeArtistId !== input.rosterArtistId) {
    // Already on the team and limited to a DIFFERENT artist, so a rollout under
    // this person's artist would be invisible to them. Widening or moving
    // somebody's access is not something a yes should do silently.
    return {
      ok: false,
      block: {
        code: 'scoped_elsewhere',
        message:
          'They are already on your team, limited to another artist. Change that in Settings, then say yes again.',
      },
    };
  }

  const addMember = !member;
  if (addMember && input.seats && !input.seats.allowed) {
    return { ok: false, block: { code: 'seat_limit', message: ceilingMessage(input.seats) } };
  }

  const createArtist = !input.rosterArtistId;
  if (createArtist && input.artists && !input.artists.allowed) {
    return { ok: false, block: { code: 'artist_limit', message: ceilingMessage(input.artists) } };
  }

  if (input.releases && !input.releases.allowed) {
    return { ok: false, block: { code: 'rollout_limit', message: ceilingMessage(input.releases) } };
  }

  return { ok: true, addMember, createArtist };
}

/** The title of the rollout a yes starts. The artist's own line about their
 *  next release goes in the description, not the title: it is a sentence, and a
 *  sentence makes a bad row in the catalogue. */
export function sharedRolloutTitle(artistName: string): string {
  const name = artistName.trim();
  return name ? `${name} rollout`.slice(0, 140) : 'Untitled rollout';
}

export type TaskLinkDecision = 'link' | 'task_missing' | 'task_mismatch' | 'already_taken';

/**
 * WHETHER THE PERSON MAY BE LINKED TO THE ACTIVITY THEY WERE ASKED ABOUT.
 *
 * The request stored the release and the task at the time it was sent, both
 * checked then. Re-checking here is what stops a task that has since moved,
 * been deleted, or been given to somebody else from being rewritten by an
 * answer that arrives days later. Never overwrites an existing person.
 */
export function decideTaskLink(input: {
  task: { releaseId: string | null; assignedPersonId: string | null } | null;
  requestReleaseId: string | null;
}): TaskLinkDecision {
  if (!input.task) return 'task_missing';
  if (!input.requestReleaseId || input.task.releaseId !== input.requestReleaseId) {
    return 'task_mismatch';
  }
  if (input.task.assignedPersonId) return 'already_taken';
  return 'link';
}
