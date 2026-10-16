// Home in four blocks, two states (URG-320, 2026-10-16, founder approved).
//
// Home answers one question: what do I do next for this release?
//
//   State A, a rollout in flight: the release header (title, days to go, the
//   Pre-release / Release / Post-release line, the team), ONE next move with
//   one button (up to two more a swipe away), Waiting on others as one row, a
//   one-line opportunity when a grant matched, and Ask UrgAns.
//
//   State B, nothing in flight: the greeting, the post-release review and the
//   start-the-next-one card (Between-Release Loop), Opportunities, Ask UrgAns.
//
// Everything that used to be its own block (getting started, up next, next
// moves, for you today, rollouts, placements, spend, the daily line, the team
// card) is either folded into these or lives in its own tab now. Pure: the
// clock is passed in so the rules can be tested.

import { getRelativeDueLabel } from '@/lib/tasks';
import { rolloutPhaseForOffset, ROLLOUT_PHASE_ORDER, type RolloutPhase } from '@/lib/rollout-phases';
import type { NextMove } from '@/lib/next-moves';
import type { HomeNextShow, HomeReleaseSummary, HomeStateKey, HomeTaskItem, HomeYourTasks } from './types';
import { pickFocusTask } from './focus';

export type HomeLayout = 'new' | 'release' | 'between';

/** Which Home to draw. A rollout in flight always wins, whatever the role. */
export function pickHomeLayout(state: HomeStateKey, inFlightCount: number): HomeLayout {
  if (inFlightCount > 0) return 'release';
  if (state.endsWith('_new')) return 'new';
  return 'between';
}

/**
 * The rollout the header is about: the next one to come out (fewest days to
 * go), then the one that came out most recently, then one with no date.
 */
export function pickHeaderRelease(releases: readonly HomeReleaseSummary[]): HomeReleaseSummary | null {
  if (releases.length === 0) return null;
  const upcoming = releases.filter((r) => r.daysOut !== null && r.daysOut >= 0).sort((a, b) => a.daysOut! - b.daysOut!);
  if (upcoming.length > 0) return upcoming[0];
  const past = releases.filter((r) => r.daysOut !== null).sort((a, b) => b.daysOut! - a.daysOut!);
  if (past.length > 0) return past[0];
  return releases[0];
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "Drops in 12 days" and "Fri 28 Oct". */
export function describeDrop(release: Pick<HomeReleaseSummary, 'daysOut' | 'releaseDate'>): {
  lead: string;
  date: string;
} {
  const date =
    release.releaseDate && Number.isFinite(Date.parse(release.releaseDate))
      ? DATE_FORMAT.format(new Date(`${release.releaseDate.slice(0, 10)}T00:00:00Z`))
      : '';
  const days = release.daysOut;
  if (days === null) return { lead: 'No release date yet', date: '' };
  if (days > 1) return { lead: `Drops in ${days} days`, date };
  if (days === 1) return { lead: 'Drops tomorrow', date };
  if (days === 0) return { lead: 'Out today', date };
  if (days === -1) return { lead: 'Out since yesterday', date };
  return { lead: `Out ${-days} days`, date };
}

export type PhaseSegment = { phase: RolloutPhase; active: boolean; fill: number };

/**
 * The three-part line under the title. The current phase is lit and filled to
 * the rollout's progress; phases behind it are full, phases ahead empty. A
 * rollout with no date has no phase yet, so no line.
 */
export function buildPhaseLine(
  release: Pick<HomeReleaseSummary, 'daysOut' | 'progress'>
): PhaseSegment[] | null {
  if (release.daysOut === null) return null;
  const current = rolloutPhaseForOffset(-release.daysOut);
  const index = ROLLOUT_PHASE_ORDER.indexOf(current);
  const ratio = release.progress.total > 0 ? release.progress.done / release.progress.total : 0;
  // Never draw a lit phase as empty: a sliver says "you are here".
  const fill = Math.max(0.06, Math.min(1, ratio));
  return ROLLOUT_PHASE_ORDER.map((phase, i) => ({
    phase,
    active: i === index,
    fill: i < index ? 1 : i === index ? fill : 0,
  }));
}

// ---------------------------------------------------------------- the one thing

export type OneThingItem =
  | { kind: 'task'; key: string; task: HomeTaskItem; due: { label: string; late: boolean } }
  | { kind: 'move'; key: string; move: NextMove }
  | { kind: 'show'; key: string; show: HomeNextShow };

export const ONE_THING_MAX = 3;

/** How soon a show has to be before it takes a place among the next moves. */
export const SHOW_SOON_DAYS = 3;

function dueOf(task: HomeTaskItem, now: Date): { label: string; late: boolean } {
  const due = getRelativeDueLabel({ dueDate: task.dueDate, completedAt: null, compressedRunway: false }, now);
  return { label: due.label, late: due.isOverdue };
}

/**
 * The next moves, most important first, at most three: your late work, then
 * the plan's own next moves (URG-259), then what is due today, then a show
 * coming up in the next three days. This week's work is not here: with none of
 * those, the card says you're clear and names the next thing due. One list replaces the old
 * Tasks, Up next, Next moves and For you today blocks, which all answered the
 * same question four ways.
 */
export function buildOneThing(
  input: {
    yourTasks: HomeYourTasks;
    moves: readonly NextMove[];
    nextShow: HomeNextShow | null;
  },
  now: Date = new Date(),
  max: number = ONE_THING_MAX
): OneThingItem[] {
  const items: OneThingItem[] = [];
  const used = new Set<string>();
  const pushTasks = (tasks: HomeTaskItem[]) => {
    let rest: HomeYourTasks = { late: tasks, today: [], week: [] };
    while (items.length < max) {
      const focus = pickFocusTask(rest);
      if (!focus) break;
      used.add(focus.task.id);
      items.push({ kind: 'task', key: `task-${focus.task.id}`, task: focus.task, due: dueOf(focus.task, now) });
      rest = { late: rest.late.filter((t) => t.id !== focus.task.id), today: [], week: [] };
    }
  };

  pushTasks(input.yourTasks.late);
  for (const move of input.moves) {
    if (items.length >= max) break;
    // A move that points at a task already on the list says the same thing twice.
    if (move.target.kind === 'task' && used.has(move.target.taskId)) continue;
    items.push({ kind: 'move', key: `move-${move.key}`, move });
  }
  pushTasks(input.yourTasks.today.filter((t) => !used.has(t.id)));
  const show = input.nextShow;
  if (items.length < max && show && show.daysUntil !== null && show.daysUntil >= 0 && show.daysUntil <= SHOW_SOON_DAYS) {
    items.push({ kind: 'show', key: `show-${show.id}`, show });
  }
  return items;
}

// ---------------------------------------------------------------- waiting row

/** "3 with your team · 1 late", or null when nothing is waiting. */
export function describeWaiting(input: { lateCount: number; onTimeCount: number; djCount: number }): {
  total: number;
  late: number;
} | null {
  const late = input.lateCount + input.djCount;
  const total = late + input.onTimeCount;
  if (total === 0) return null;
  return { total, late };
}

export const HOME_FOUR_COPY = {
  next: 'Next',
  openTask: 'Open task',
  openShow: 'Open show',
  clearTitle: "You're clear for today.",
  waiting: 'Waiting on others',
  withTeam: (n: number) => `${n} with your team`,
  late: (n: number) => `${n} late`,
  noRelease: 'No release in flight.',
  startTitle: 'Start the next one early.',
  startLine: 'Sessions, songwriting, mix and master.',
  startAction: 'Start the next rollout',
  moreRollouts: (n: number) => `+${n} rollout${n === 1 ? '' : 's'}`,
  grantsFit: (n: number) => (n === 1 ? '1 new grant fits your team' : `${n} new grants fit your team`),
  loadFailed: "Home didn't load.",
  loadFailedLine: 'Your rollouts are safe.',
  tryAgain: 'Try again',
  openCatalogue: 'Open Catalogue',
} as const;

/** "Next up: Pre-save campaign, due Mon 19 Oct." for the clear state, or null. */
export function describeNextUp(week: readonly HomeTaskItem[], now: Date = new Date()): string | null {
  const focus = pickFocusTask({ late: [], today: [], week: [...week] });
  if (!focus) return null;
  const due = dueOf(focus.task, now).label;
  return `Next up: ${focus.task.title.replace(/[\s.,:;]+$/, '')}, ${due.charAt(0).toLowerCase()}${due.slice(1)}.`;
}
