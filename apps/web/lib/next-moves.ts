/**
 * Next moves (URG-259, 2026-10-14): after something happens on a rollout, the
 * one to three things worth doing next, each a single tap.
 *
 * RULES, NOT A MODEL. Every move is decided from facts Home and the rollout page
 * already hold (the rollout, its activities, its pitches), so there is no extra
 * query for the facts, no model call and no credit cost. The founder asked for
 * minimal cognitive load: a verb title, one short line, one button.
 *
 * The triggers are states, not events. "A rollout was created" is a rollout with
 * no activities; "a block of work was finished" is a phase whose work is all
 * done with the next one still open; "a pitch was sent" is a pitch in the last
 * two weeks. Working them out from state means a move shows on whichever device
 * the person opens next, and goes away by itself once it is done.
 *
 * DISMISS STICKS. Each move has a stable key (rule + rollout, plus the phase for
 * the next-phase move) and a dismissed key is never shown again
 * (next_move_dismissals, with a local copy so it holds offline too).
 *
 * Pure: today is passed in. All the words live in NEXT_MOVE_COPY. House rules:
 * no em dashes, no exclamation marks, no "workspace".
 */

import { daysToRelease, isEditorialPitchTask, pitchWindowState, daysUntilWindowCloses } from './editorial-pitch';
import { dayOffsetFromRelease } from './release-timeline';
import { derivePlanPhase, PLAN_PHASE_LABELS, PLAN_PHASE_ORDER, type PlanPhase } from './plan-phase';

export type NextMoveRule = 'plan' | 'distribute' | 'editorial' | 'next_phase' | 'pitch_more' | 'invite';

/** Lower comes first. The order is the founder's "what matters most now". */
export const NEXT_MOVE_PRIORITY: Readonly<Record<NextMoveRule, number>> = {
  plan: 10,
  distribute: 20,
  editorial: 30,
  next_phase: 40,
  pitch_more: 50,
  invite: 60,
};

/** At most this many cards anywhere. */
export const NEXT_MOVES_LIMIT = 3;
/** The distribution check is offered this many days out, or fewer. */
export const DISTRIBUTE_WINDOW_DAYS = 14;
/** "Pitch more" follows a pitch sent this recently. */
export const PITCH_MORE_RECENT_DAYS = 14;
/** "Pitch more" stops once a rollout has this many pitches. */
export const PITCH_MORE_TARGET = 3;
/** A task title longer than this is cut, so the card stays one line. */
export const NEXT_MOVE_TITLE_MAX = 60;

export const NEXT_MOVE_COPY = {
  label: 'Next moves',
  dismiss: 'Not now',
  plan: { title: 'Build the plan', detail: 'AI writes it from a few answers.', action: 'Plan it' },
  distribute: {
    title: 'Run the distribution check',
    detail: (days: number) => `Out in ${days} ${days === 1 ? 'day' : 'days'}. Catch gaps before your distributor does.`,
    action: 'Check it',
  },
  editorial: {
    title: 'Pitch Spotify editorial',
    detail: (days: number) =>
      days <= 0 ? 'The window closes today.' : `The window closes in ${days} ${days === 1 ? 'day' : 'days'}.`,
    action: 'Open it',
  },
  nextPhase: {
    title: (taskTitle: string) => `Start: ${taskTitle}`,
    detail: (phaseLabel: string) => `${phaseLabel} is done. This is next.`,
    action: 'Open it',
  },
  pitchMore: {
    title: (left: number) => `Pitch ${left} more ${left === 1 ? 'curator' : 'curators'}`,
    detail: 'More pitches, more chances of an add.',
    action: 'Pitch',
  },
  invite: { title: 'Invite your team', detail: 'Give each person their part of the plan.', action: 'Invite' },
} as const;

export type NextMoveTarget =
  | { kind: 'link'; href: string }
  /**
   * Open Settings over the page the person is on (2026-10-17), so closing it
   * returns them there instead of to the rollout behind it.
   */
  | { kind: 'settings'; segment: 'team'; section: string }
  /** Open the rollout, then the activity's drawer over it. */
  | { kind: 'task'; releaseId: string; taskId: string };

export type NextMove = {
  key: string;
  rule: NextMoveRule;
  releaseId: string;
  /** The rollout's name, shown on Home where several rollouts share the list. */
  releaseTitle: string;
  title: string;
  detail: string;
  action: string;
  target: NextMoveTarget;
};

export type NextMoveTask = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  templateTaskId: string | null;
  assignedToUserId: string | null;
};

export type NextMoveRollout = {
  id: string;
  title: string;
  releaseDate: string | null;
  status: string | null;
  /** The viewer owns it: only an owner plans it or invites people to it. */
  isOwner: boolean;
  tasks: readonly NextMoveTask[];
  /** Null when unknown (pitching off, or not loaded): no pitch move then. */
  pitches: { count: number; lastSentDaysAgo: number | null } | null;
};

export type NextMoveFlags = {
  planner: boolean;
  pitching: boolean;
};

export type NextMoveSurface = 'home' | 'rollout';

const isClosed = (status: string) => status === 'done' || status === 'cancelled';

export function nextMoveKey(rule: NextMoveRule, releaseId: string, extra?: string): string {
  return extra ? `${rule}:${releaseId}:${extra}` : `${rule}:${releaseId}`;
}

const rolloutHref = (releaseId: string, extra = '') => `/dashboard?release=${encodeURIComponent(releaseId)}${extra}`;

function clip(text: string, max = NEXT_MOVE_TITLE_MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The first phase still holding open work, and the phase before it when that
 * one was finished. Null when there is no such pair: nothing done yet, all done,
 * or no date to place the work on.
 */
export function findPhaseHandoff(
  tasks: readonly NextMoveTask[],
  releaseDate: string | null
): { finished: PlanPhase; next: PlanPhase; task: NextMoveTask } | null {
  if (!releaseDate) return null;
  const byPhase = new Map<PlanPhase, NextMoveTask[]>();
  for (const task of tasks) {
    if (task.status === 'cancelled') continue;
    const offset = dayOffsetFromRelease(task.dueDate, releaseDate);
    if (offset === null) continue;
    const phase = derivePlanPhase(offset);
    const list = byPhase.get(phase) ?? [];
    list.push(task);
    byPhase.set(phase, list);
  }

  const withWork = PLAN_PHASE_ORDER.filter((phase) => (byPhase.get(phase) ?? []).length > 0);
  const nextIndex = withWork.findIndex((phase) => (byPhase.get(phase) ?? []).some((task) => !isClosed(task.status)));
  if (nextIndex <= 0) return null;
  const finished = withWork[nextIndex - 1];
  const next = withWork[nextIndex];
  const open = (byPhase.get(next) ?? [])
    .filter((task) => !isClosed(task.status))
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  return open[0] ? { finished, next, task: open[0] } : null;
}

/** Every move one rollout has right now, before dismissals and the limit. */
export function movesForRollout(
  rollout: NextMoveRollout,
  input: { now: Date; flags: NextMoveFlags; surface: NextMoveSurface }
): NextMove[] {
  const { now, flags, surface } = input;
  const moves: NextMove[] = [];
  const base = { releaseId: rollout.id, releaseTitle: rollout.title || 'Untitled rollout' };
  const days = daysToRelease(rollout.releaseDate, now);
  const released = rollout.status === 'released' || rollout.status === 'archived' || (days !== null && days < 0);
  const activities = rollout.tasks;

  // A rollout with nothing in it: the plan comes first. On the rollout page the
  // planner card already says this, so only Home offers it.
  if (activities.length === 0) {
    if (flags.planner && rollout.isOwner && surface === 'home' && !released) {
      moves.push({
        ...base,
        key: nextMoveKey('plan', rollout.id),
        rule: 'plan',
        title: NEXT_MOVE_COPY.plan.title,
        detail: NEXT_MOVE_COPY.plan.detail,
        action: NEXT_MOVE_COPY.plan.action,
        target: { kind: 'link', href: rolloutHref(rollout.id) },
      });
    }
    return moves;
  }

  // Every activity cancelled (URG-399, Oct 19, 2026): the plan was dropped and
  // the timeline reads All clear, so nothing is next. "Run the distribution
  // check" under that line asked for work nobody owes.
  if (activities.every((task) => task.status === 'cancelled')) return moves;

  if (!released && days !== null && days >= 1 && days <= DISTRIBUTE_WINDOW_DAYS) {
    moves.push({
      ...base,
      key: nextMoveKey('distribute', rollout.id),
      rule: 'distribute',
      title: NEXT_MOVE_COPY.distribute.title,
      detail: NEXT_MOVE_COPY.distribute.detail(days),
      action: NEXT_MOVE_COPY.distribute.action,
      target: { kind: 'link', href: rolloutHref(rollout.id, '&scene=distribute') },
    });
  }

  const editorial = activities.find((task) => isEditorialPitchTask(task.templateTaskId));
  if (editorial && !isClosed(editorial.status) && pitchWindowState(days) === 'open') {
    moves.push({
      ...base,
      key: nextMoveKey('editorial', rollout.id),
      rule: 'editorial',
      title: NEXT_MOVE_COPY.editorial.title,
      detail: NEXT_MOVE_COPY.editorial.detail(daysUntilWindowCloses(days as number)),
      action: NEXT_MOVE_COPY.editorial.action,
      target: { kind: 'task', releaseId: rollout.id, taskId: editorial.id },
    });
  }

  const handoff = findPhaseHandoff(activities, rollout.releaseDate);
  // The editorial pitch already has its own card; do not offer it twice.
  if (handoff && handoff.task.id !== editorial?.id) {
    moves.push({
      ...base,
      key: nextMoveKey('next_phase', rollout.id, handoff.next),
      rule: 'next_phase',
      title: NEXT_MOVE_COPY.nextPhase.title(clip(handoff.task.title)),
      detail: NEXT_MOVE_COPY.nextPhase.detail(PLAN_PHASE_LABELS[handoff.finished]),
      action: NEXT_MOVE_COPY.nextPhase.action,
      target: { kind: 'task', releaseId: rollout.id, taskId: handoff.task.id },
    });
  }

  const pitches = rollout.pitches;
  if (
    flags.pitching &&
    pitches &&
    pitches.count > 0 &&
    pitches.count < PITCH_MORE_TARGET &&
    pitches.lastSentDaysAgo !== null &&
    pitches.lastSentDaysAgo <= PITCH_MORE_RECENT_DAYS
  ) {
    const left = PITCH_MORE_TARGET - pitches.count;
    moves.push({
      ...base,
      key: nextMoveKey('pitch_more', rollout.id),
      rule: 'pitch_more',
      title: NEXT_MOVE_COPY.pitchMore.title(left),
      detail: NEXT_MOVE_COPY.pitchMore.detail,
      action: NEXT_MOVE_COPY.pitchMore.action,
      target: { kind: 'link', href: rolloutHref(rollout.id, '&scene=pitch') },
    });
  }

  if (rollout.isOwner && !released) {
    const people = new Set(activities.map((task) => task.assignedToUserId).filter(Boolean));
    if (people.size <= 1) {
      moves.push({
        ...base,
        key: nextMoveKey('invite', rollout.id),
        rule: 'invite',
        title: NEXT_MOVE_COPY.invite.title,
        detail: NEXT_MOVE_COPY.invite.detail,
        action: NEXT_MOVE_COPY.invite.action,
        target: { kind: 'settings', segment: 'team', section: 'teammates' },
      });
    }
  }

  return moves;
}

/**
 * The moves to show: dismissed ones dropped, most important first, soonest
 * release breaking ties, at most NEXT_MOVES_LIMIT. Invite is one team-wide ask,
 * so it shows for one rollout at most.
 */
export function pickNextMoves(input: {
  rollouts: readonly NextMoveRollout[];
  dismissed: ReadonlySet<string>;
  now: Date;
  flags: NextMoveFlags;
  surface: NextMoveSurface;
  limit?: number;
  /**
   * Whether this person already has a team (anyone invited or active in the
   * workspace they own). Invite your team shows only on a plain false: a team
   * means they have invited before, and unknown means don't ask (founder,
   * 2026-10-14: the card was "too persistent").
   */
  hasTeam?: boolean | null;
}): NextMove[] {
  const limit = input.limit ?? NEXT_MOVES_LIMIT;
  const soonness = new Map<string, number>();
  for (const rollout of input.rollouts) {
    const days = daysToRelease(rollout.releaseDate, input.now);
    soonness.set(rollout.id, days === null || days < 0 ? Number.MAX_SAFE_INTEGER : days);
  }

  // Invite is one team-wide ask, so "Not now" on any rollout's Invite card
  // puts it away on every rollout, not just that one.
  const inviteDismissed = [...input.dismissed].some((key) => key.startsWith('invite:'));
  const askInvite = input.hasTeam === false && !inviteDismissed;

  const all = input.rollouts
    .flatMap((rollout) => movesForRollout(rollout, input))
    .filter((move) => !input.dismissed.has(move.key))
    .filter((move) => move.rule !== 'invite' || askInvite)
    .sort(
      (a, b) =>
        NEXT_MOVE_PRIORITY[a.rule] - NEXT_MOVE_PRIORITY[b.rule] ||
        (soonness.get(a.releaseId) ?? 0) - (soonness.get(b.releaseId) ?? 0) ||
        a.key.localeCompare(b.key)
    );

  const picked: NextMove[] = [];
  let invited = false;
  for (const move of all) {
    if (picked.length >= limit) break;
    if (move.rule === 'invite') {
      if (invited) continue;
      invited = true;
    }
    picked.push(move);
  }
  return picked;
}

/** A dismiss key the server will store: rule, a uuid-ish id, an optional phase. */
export function isValidNextMoveKey(key: unknown): key is string {
  return (
    typeof key === 'string' &&
    key.length <= 120 &&
    /^(plan|distribute|editorial|next_phase|pitch_more|invite):[0-9a-f-]{8,64}(:[a-z_]{1,20})?$/i.test(key)
  );
}
