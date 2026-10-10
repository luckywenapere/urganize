import { MAX_HIRES_PER_TEAM, type WorkRequestStartKind } from './work-requests';

/**
 * Turning a yes into a shared rollout (directory spec, "From profile to working
 * together"): "Accepting a request creates the release and puts both people on
 * it, so a match is counted the moment real work begins."
 *
 * The decisions are pure and live here so a change to who gets added to whose
 * team, or what is promised in the sentence that says so, is a failing test.
 * lib/work-request-start-server.ts is the I/O half.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A HIRE DOES NOT TAKE A SEAT, and that is a product decision, so it is written
 * down here where it can be found and reversed.
 *
 * Seats are the thing a plan sells: Solo has one and it is the owner's. If a
 * freelancer hired for one video took a seat, a Solo manager could never hire
 * anybody, and Manager (four seats) would be full after three hires. That would
 * break the loop this whole feature exists for (every connection should end in a
 * shared rollout), and the strategy doc says the money comes from the take rate
 * on hires, not from charging to search or to join. So a hire joins as a member
 * flagged `is_hire`, which `countTeamSeats` leaves out of the count.
 *
 * What stops that becoming a way to run a big team on a small plan:
 *   - a hire is scoped to the one ARTIST the rollout belongs to, so they see that
 *     artist's rollouts and nothing else the team does;
 *   - a team may have at most MAX_HIRES_PER_TEAM of them;
 *   - only the person themselves saying "accept and start" can create one.
 *
 * An ARTIST SIGNED BY A MANAGER is the opposite case and does take a seat. It
 * is the same seat and artist-roster rules as any invite, which makes the paid
 * plan the upgrade path when a manager signs an artist (the spec's open question
 * 5, answered the cheap way: no take on signings, the Manager plan is the money).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** What a hire is, as a workspace member. Not an admin, not a guest: they have
 *  to be able to finish the work they were hired for, and a guest is read-only. */
export const HIRE_MEMBER_ROLE = 'member';

export type StartMemberRow = {
  workspace_id: string;
  user_id: string;
  email: string;
  role: typeof HIRE_MEMBER_ROLE;
  status: 'active';
  /** True for a hire (no seat), false for an artist a manager signs (a seat). */
  is_hire: boolean;
  artist_scope_id: string | null;
  invite_token: null;
  invite_expires_at: null;
  invited_at: string;
  joined_at: string;
  updated_at: string;
};

/** Kept for the name the tests and the header use: a hire is the common case. */
export type HireMemberRow = StartMemberRow & { is_hire: true };

/**
 * The membership row a yes creates. One builder for both sides, because the two
 * rows differ in exactly one column: `is_hire` is what leaves a hire out of the
 * seat count, and an artist a manager signs is deliberately a full seat.
 */
export function buildStartMemberRow(input: {
  workspaceId: string;
  userId: string;
  email: string;
  artistScopeId: string | null;
  isHire: boolean;
  now?: Date;
}): StartMemberRow {
  const stamp = (input.now ?? new Date()).toISOString();
  return {
    workspace_id: input.workspaceId,
    user_id: input.userId,
    email: input.email.trim().toLowerCase(),
    role: HIRE_MEMBER_ROLE,
    status: 'active',
    is_hire: input.isHire,
    // The scope is what keeps a hire to the one artist's rollouts. Null means
    // the whole team's, so the server refuses to add anybody without one.
    artist_scope_id: input.artistScopeId,
    invite_token: null,
    invite_expires_at: null,
    invited_at: stamp,
    joined_at: stamp,
    updated_at: stamp,
  };
}

export function buildHireMemberRow(input: {
  workspaceId: string;
  userId: string;
  email: string;
  artistScopeId: string | null;
  now?: Date;
}): HireMemberRow {
  return { ...buildStartMemberRow({ ...input, isHire: true }), is_hire: true };
}

/** Whether the team can take another hire. An unreadable count fails OPEN, like
 *  every counter here: refusing somebody's yes over a read blip is the worse
 *  mistake. */
export function hireHasRoom(activeHires: number | null): boolean {
  if (activeHires === null) return true;
  return activeHires < MAX_HIRES_PER_TEAM;
}

export type StartRefusal =
  | 'rollout_limit'
  | 'artist_limit'
  | 'hire_limit'
  | 'sender_left'
  | 'release_gone'
  | 'failed';

export type StartResult =
  | {
      status: 'started';
      kind: WorkRequestStartKind;
      releaseId: string;
      releaseTitle: string;
      /** The other person is now on the team. False when a seat was not free. */
      personAdded: boolean;
      /** The activity that is now theirs, for a hire who was asked about one. */
      taskTitle: string | null;
    }
  | {
      status: 'not_started';
      kind: WorkRequestStartKind;
      reason: StartRefusal;
      /** The plan's own sentence for a limit, when there is one. */
      detail: string | null;
    };

export type StartCopyContext = {
  /** The other person's name: the artist, for a manager; the team, for a hire. */
  otherName: string;
};

const quote = (value: string) => `“${value}”`;

/**
 * The sentence the person who said yes reads straight after saying it. Plain
 * words, and it always says what happened to the answer itself: the yes is
 * saved whether or not the rollout could start, so a refusal never reads as a
 * lost answer.
 */
export function describeStartResult(result: StartResult, context: StartCopyContext): string {
  const other = context.otherName.trim() || 'They';

  if (result.status === 'started') {
    const title = quote(result.releaseTitle);
    if (result.kind === 'manager_rollout') {
      return result.personAdded
        ? `Started ${title}. ${other} is on it with you.`
        : `Started ${title}. ${other} is not on it yet because your plan has no free seat. Free one up or change plan, then invite them.`;
    }
    return result.taskTitle
      ? `You are on ${title} with ${other}, and ${quote(result.taskTitle)} is yours.`
      : `You are on ${title} with ${other}.`;
  }

  switch (result.reason) {
    case 'rollout_limit':
      return `Your yes is saved. ${result.detail || 'Your plan has no room for another rollout.'} Make room, then start it from your rollouts.`;
    case 'artist_limit':
      return `Your yes is saved. ${result.detail || 'Your plan has no room for another artist.'} Make room, then start the rollout yourself.`;
    case 'hire_limit':
      return `Your yes is saved, but ${other} already has ${MAX_HIRES_PER_TEAM} people hired in, which is the most a team can have. Tell them to make room.`;
    case 'sender_left':
      return `Your yes is saved. ${other} is no longer on that team, so there was nothing to join.`;
    case 'release_gone':
      return `Your yes is saved. That rollout is gone, so there was nothing to join.`;
    default:
      return 'Your yes is saved, but we could not start the rollout. Write to them and sort it out.';
  }
}

/**
 * The line the SENDER reads once the other person has started the work, for the
 * answer email and the sent list. Says only what is true from their side: the
 * rollout they asked about now has the person on it.
 */
export function describeStartForSender(result: StartResult, answererName: string): string | null {
  if (result.status !== 'started') return null;
  const name = answererName.trim() || 'They';
  const title = quote(result.releaseTitle);
  if (result.kind === 'manager_rollout') {
    return result.personAdded
      ? `${name} started ${title} and you are on it.`
      : `${name} started ${title}. Their team needs a free seat before you can join it.`;
  }
  return result.taskTitle
    ? `${name} is on ${title} and ${quote(result.taskTitle)} is theirs now.`
    : `${name} is on ${title}.`;
}
