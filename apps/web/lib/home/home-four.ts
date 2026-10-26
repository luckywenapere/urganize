// Home in four blocks, two states (URG-320, 2026-10-16, founder approved).
//
// Home answers one question: what do I do next for this release?
//
//   State A, a rollout in flight: the greeting with the bell (the rollout
//   header with its phase bars and faces was removed 2026-10-26, founder call:
//   it confused people), ONE next move with
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
import type { NextMove } from '@/lib/next-moves';
import type { HomeReleaseSummary, HomeStateKey, HomeTaskItem, HomeYourTasks } from './types';
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

// ---------------------------------------------------------------- the one thing

export type OneThingItem =
  | { kind: 'task'; key: string; task: HomeTaskItem; due: { label: string; late: boolean } }
  | { kind: 'move'; key: string; move: NextMove };

export const ONE_THING_MAX = 3;

function dueOf(task: HomeTaskItem, now: Date): { label: string; late: boolean } {
  const due = getRelativeDueLabel(
    { dueDate: task.dueDate, completedAt: null, compressedRunway: false, relativeWhen: task.relativeWhen },
    now
  );
  return { label: due.label, late: due.isOverdue };
}

/**
 * The next moves, most important first, at most three: your late work, then
 * the plan's own next moves (URG-259), then what is due today. This week's work is not here: with none of
 * those, the card says you're clear and names the next thing due. One list replaces the old
 * Tasks, Up next, Next moves and For you today blocks, which all answered the
 * same question four ways.
 */
export function buildOneThing(
  input: {
    yourTasks: HomeYourTasks;
    moves: readonly NextMove[];
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
  return items;
}

/**
 * The small line on the task card (2026-10-18, golden layout B): "Next" and the
 * due label ("Next · Due today"), or just "Next" when the task has no date.
 */
export function describeTaskLabel(due: { label: string } | null | undefined): string {
  const label = due?.label?.trim();
  if (!label || label === 'No due date') return HOME_FOUR_COPY.next;
  return `${HOME_FOUR_COPY.next} · ${label}`;
}

/**
 * Where the task lives, only when it is not the release the header names
 * (the header already says which release Home is about).
 */
export function describeTaskWhere(
  task: Pick<HomeTaskItem, 'releaseId' | 'releaseTitle' | 'artistName'>,
  headerReleaseId: string | null
): string | null {
  if (headerReleaseId && task.releaseId === headerReleaseId) return null;
  const where = [task.releaseTitle, task.artistName].filter(Boolean).join(' · ');
  return where || null;
}

// ---------------------------------------------------------------- lower band

/** The Done row's numbers, or null when the rollout has no tasks yet (the row hides). */
export function describeDone(progress: { done: number; total: number } | null | undefined): {
  done: number;
  total: number;
} | null {
  if (!progress || !(progress.total > 0)) return null;
  return { done: Math.max(0, Math.min(progress.done, progress.total)), total: progress.total };
}

// ---------------------------------------------------------------- waiting row

/** "3 with your team · 1 late", or null when nothing is waiting. */
export function describeWaiting(input: { lateCount: number; onTimeCount: number }): {
  total: number;
  late: number;
} | null {
  const late = input.lateCount;
  const total = late + input.onTimeCount;
  if (total === 0) return null;
  return { total, late };
}

export const HOME_FOUR_COPY = {
  next: 'Next',
  openTask: 'Open task',
  clearTitle: "You're clear for today.",
  waiting: 'Waiting on others',
  done: 'Done',
  of: (total: number) => `of ${total}`,
  late: (n: number) => `${n} late`,
  noRelease: 'No release in flight.',
  startTitle: 'Start the next one early.',
  startLine: 'Sessions, songwriting, mix and master.',
  startAction: 'Start the next rollout',
  grantsFit: (n: number) => (n === 1 ? '1 new grant fits your team' : `${n} new grants fit your team`),
  loadFailed: "Home didn't load.",
  loadFailedLine: 'Your rollouts are safe.',
  tryAgain: 'Try again',
  openCatalogue: 'Open Artists',
} as const;

/** "Next up: Pre-save campaign, due Mon 19 Oct." for the clear state, or null. */
export function describeNextUp(week: readonly HomeTaskItem[], now: Date = new Date()): string | null {
  const focus = pickFocusTask({ late: [], today: [], week: [...week] });
  if (!focus) return null;
  const due = dueOf(focus.task, now).label;
  return `Next up: ${focus.task.title.replace(/[\s.,:;]+$/, '')}, ${due.charAt(0).toLowerCase()}${due.slice(1)}.`;
}
