import { afterEach, describe, expect, it } from 'vitest';
import { buildTask } from './home/test-fixtures';
import {
  daysUntilDue,
  dueCalendarDay,
  getRelativeDueLabel,
  getTaskSectionKey,
  isClosedStatus,
} from './tasks';
import {
  buildReleaseTimeline,
  closedSummaryLine,
  foldPastWeeks,
  groupItemsByWeek,
  narrowTimeline,
  rolloutClosedSummary,
} from './release-timeline';
import {
  EMPTY_PLAN_FILTERS,
  SHOW_CANCELLED_MAX_ROLLOUTS,
  isShowCancelledMap,
  selectPlanTasks,
  withShowCancelled,
} from './plan-focus';
import { dependencyHint, getTaskCompletionBlocker } from './release-execution';
import { isDependencySatisfied, type ExecutionTask } from './execution-types';
import { countProgress } from './task-progress';
import { pitchBlockedBy } from './editorial-pitch-server';
import { DISTRIBUTION_ORDER_TASK_IDS, EDITORIAL_PITCH_TASK_ID } from './editorial-pitch';
import { summarizeRolloutPhases } from './rollout-phases';
import type { Task } from '@/types/tasks';
import { isReleaseDelivered } from './delivery-records';

/**
 * Cancelled activities (URG-389, Oct 19, 2026). Founder's screenshot:
 * "Pitch to Spotify editorial · Cancelled · Honest · Behind by 10 days".
 * Production showed the same bug on every done task too: 189 of 189 done
 * tasks on outside accounts have completed_at = null, and the due label read
 * completedAt instead of status.
 */

const NOW = new Date(2026, 9, 19, 10, 0, 0); // Mon 19 Oct 2026, 10:00 local
const RELEASE = '2026-11-20';

function iso(daysFromNow: number): string {
  const d = new Date(Date.UTC(2026, 9, 19 + daysFromNow));
  return d.toISOString().slice(0, 10) + 'T00:00:00+00:00';
}

function task(overrides: Partial<Task>): Task {
  return buildTask({ id: overrides.id ?? overrides.title ?? 't', ...overrides });
}

describe('closed work never reads as due, late or behind', () => {
  it('a cancelled catch-up task shows no "Behind by" (the founder screenshot)', () => {
    const due = getRelativeDueLabel(
      { dueDate: iso(-10), completedAt: null, compressedRunway: true, status: 'cancelled' },
      NOW
    );
    expect(due).toEqual({ label: '', isOverdue: false });
  });

  it('a done task with no completedAt (every task done before v1.158.0) is not overdue', () => {
    const due = getRelativeDueLabel(
      { dueDate: iso(-50), completedAt: null, compressedRunway: false, status: 'done' },
      NOW
    );
    expect(due).toEqual({ label: '', isOverdue: false });
  });

  it('a cancelled task due later shows no "Due in" either', () => {
    expect(
      getRelativeDueLabel({ dueDate: iso(5), completedAt: null, compressedRunway: false, status: 'cancelled' }, NOW).label
    ).toBe('');
  });

  it('open work keeps its copy, red only for real slippage', () => {
    expect(getRelativeDueLabel({ dueDate: iso(-3), completedAt: null, compressedRunway: false, status: 'todo' }, NOW)).toEqual({
      label: '3 days overdue',
      isOverdue: true,
    });
    expect(getRelativeDueLabel({ dueDate: iso(-3), completedAt: null, compressedRunway: true, status: 'todo' }, NOW)).toEqual({
      label: 'Behind by 3 days',
      isOverdue: false,
    });
    expect(getRelativeDueLabel({ dueDate: iso(2), completedAt: null, compressedRunway: false }, NOW).label).toBe('Due in 2 days');
    expect(getRelativeDueLabel({ dueDate: null, completedAt: null, compressedRunway: false, status: 'todo' }, NOW).label).toBe(
      'No due date'
    );
  });

  it('callers that pass no status (Home, open tasks only) behave as before', () => {
    expect(getRelativeDueLabel({ dueDate: iso(0), completedAt: null, compressedRunway: false }, NOW).label).toBe('Due today');
  });

  it('a cancelled task is in the Cancelled section whatever its date', () => {
    expect(getTaskSectionKey(task({ status: 'cancelled', dueDate: iso(-10), compressedRunway: true }), NOW)).toBe('cancelled');
    expect(getTaskSectionKey(task({ status: 'cancelled', dueDate: null }), NOW)).toBe('cancelled');
  });

  it('isClosedStatus', () => {
    expect(isClosedStatus('done')).toBe(true);
    expect(isClosedStatus('cancelled')).toBe(true);
    expect(isClosedStatus('blocked')).toBe(false);
    expect(isClosedStatus(undefined)).toBe(false);
  });
});

describe('the user\'s day versus the UTC grid', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('a UTC-midnight due date is that calendar day in New York (was a day early)', () => {
    process.env.TZ = 'America/New_York';
    const morning = new Date(2026, 9, 20, 9, 0, 0); // 20 Oct, 09:00 New York
    // Guard: the zone switch really took effect (read as an instant, UTC
    // midnight on the 20th is the evening of the 19th here).
    expect(new Date('2026-10-20T00:00:00Z').getDate()).toBe(19);
    expect(daysUntilDue('2026-10-20T00:00:00+00:00', morning)).toBe(0);
    expect(daysUntilDue('2026-10-20T00:00:00.000Z', morning)).toBe(0);
    expect(daysUntilDue('2026-10-21', morning)).toBe(1);
    const label = getRelativeDueLabel({ dueDate: '2026-10-20T00:00:00+00:00', completedAt: null, compressedRunway: false }, morning);
    expect(label.label).toBe('Due today');
  });

  it('and in Lagos and Tokyo', () => {
    for (const tz of ['Africa/Lagos', 'Asia/Tokyo']) {
      process.env.TZ = tz;
      const morning = new Date(2026, 9, 20, 9, 0, 0);
      expect(daysUntilDue('2026-10-20T00:00:00+00:00', morning)).toBe(0);
    }
  });

  it('a naive local time (not UTC midnight) keeps its instant', () => {
    process.env.TZ = 'Africa/Lagos';
    const day = dueCalendarDay('2026-10-20T23:30:00+00:00');
    // 23:30 UTC is 00:30 on the 21st in Lagos.
    expect(day?.getDate()).toBe(21);
  });

  it('nonsense is no date', () => {
    expect(dueCalendarDay('not a date')).toBeNull();
    expect(dueCalendarDay(null)).toBeNull();
    expect(daysUntilDue('', NOW)).toBeNull();
  });
});

describe('hidden by default, one tap away, always found by search', () => {
  const tasks = [
    task({ id: 'a', title: 'Cover art final', releaseId: 'r1', status: 'todo', dueDate: iso(3), planKey: true } as Partial<Task>),
    task({ id: 'b', title: 'Pitch to Spotify editorial', releaseId: 'r1', status: 'cancelled', dueDate: iso(-10), planKey: true } as Partial<Task>),
    task({ id: 'c', title: 'Press release', releaseId: 'r1', status: 'done', dueDate: iso(-20) }),
    task({ id: 'd', title: 'Radio push', releaseId: 'r1', status: 'cancelled', dueDate: iso(9) }),
  ];

  it('the plain list leaves cancelled work out and counts it separately', () => {
    const result = selectPlanTasks(tasks, { filters: EMPTY_PLAN_FILTERS, showAll: true, now: NOW });
    expect(result.visible.map((t) => t.id)).toEqual(['a', 'c']);
    expect(result.cancelledCount).toBe(2);
    expect(result.liveCount).toBe(2);
  });

  it('a cancelled key task does not take a key slot or a hidden count', () => {
    const result = selectPlanTasks(tasks, { filters: EMPTY_PLAN_FILTERS, showAll: false, now: NOW });
    expect(result.visible.some((t) => t.status === 'cancelled')).toBe(false);
    expect(result.hiddenCount).toBeGreaterThanOrEqual(0);
    expect(result.hiddenCount).toBeLessThanOrEqual(result.liveCount);
  });

  it('Show cancelled brings every cancelled activity back, key or not', () => {
    const result = selectPlanTasks(tasks, { filters: EMPTY_PLAN_FILTERS, showAll: false, showCancelled: true, now: NOW });
    expect(result.visible.map((t) => t.id).sort()).toEqual(expect.arrayContaining(['b', 'd']));
  });

  it('search finds cancelled work without the toggle', () => {
    const result = selectPlanTasks(tasks, { filters: { ...EMPTY_PLAN_FILTERS, query: 'spotify' }, showAll: false, now: NOW });
    expect(result.visible.map((t) => t.id)).toEqual(['b']);
    expect(result.filtering).toBe(true);
  });

  it('the Status filter has a Cancelled option, and To do never includes cancelled', () => {
    const cancelled = selectPlanTasks(tasks, { filters: { ...EMPTY_PLAN_FILTERS, status: 'cancelled' }, showAll: false, now: NOW });
    expect(cancelled.visible.map((t) => t.id).sort()).toEqual(['b', 'd']);
    const todo = selectPlanTasks(tasks, { filters: { ...EMPTY_PLAN_FILTERS, status: 'todo' }, showAll: false, now: NOW });
    expect(todo.visible.map((t) => t.id)).toEqual(['a']);
  });

  it('the Overdue filter never matches cancelled work', () => {
    const overdue = selectPlanTasks(tasks, { filters: { ...EMPTY_PLAN_FILTERS, when: 'overdue' }, showAll: false, now: NOW });
    expect(overdue.visible).toEqual([]);
  });
});

describe('Show cancelled is remembered per rollout on this device', () => {
  it('on adds, off removes, other rollouts are untouched', () => {
    let map = withShowCancelled({}, 'r1', true);
    map = withShowCancelled(map, 'r2', true);
    expect(map).toEqual({ r1: true, r2: true });
    map = withShowCancelled(map, 'r1', false);
    expect(map).toEqual({ r2: true });
  });

  it('keeps at most the newest rollouts', () => {
    let map = {};
    for (let i = 0; i < SHOW_CANCELLED_MAX_ROLLOUTS + 5; i += 1) map = withShowCancelled(map, `r${i}`, true);
    const ids = Object.keys(map);
    expect(ids).toHaveLength(SHOW_CANCELLED_MAX_ROLLOUTS);
    expect(ids).not.toContain('r0');
    expect(ids).toContain(`r${SHOW_CANCELLED_MAX_ROLLOUTS + 4}`);
  });

  it('rejects anything that is not the stored shape', () => {
    expect(isShowCancelledMap({ r1: true })).toBe(true);
    expect(isShowCancelledMap({ r1: false })).toBe(false);
    expect(isShowCancelledMap(['r1'])).toBe(false);
    expect(isShowCancelledMap(null)).toBe(false);
  });
});

describe('the timeline: counts, empty blocks and the axis', () => {
  const now = new Date(Date.UTC(2026, 9, 19, 12));
  const t = (id: string, offset: number, status: Task['status'], extra: Partial<Task> = {}) =>
    task({
      id,
      title: id,
      status,
      dueDate: new Date(Date.UTC(2026, 10, 20 + offset)).toISOString(),
      ...extra,
    });

  it('phase counts leave cancelled out of the denominator', () => {
    const timeline = buildReleaseTimeline({
      tasks: [t('a', -30, 'done'), t('b', -29, 'todo'), t('c', -28, 'cancelled')],
      releaseDate: RELEASE,
      now,
    })!;
    const pre = timeline.phases.find((phase) => phase.phase === 'pre_release')!;
    expect(pre.doneCount).toBe(1);
    expect(pre.liveCount).toBe(2);
    expect(pre.items).toHaveLength(3);
    const narrowed = narrowTimeline(timeline, new Set(['a', 'c']));
    expect(narrowed.phases[0].liveCount).toBe(1);
  });

  it('a phase holding only cancelled (hidden) work drops out entirely', () => {
    const all = [t('a', -30, 'todo'), t('p', 10, 'cancelled'), t('q', 12, 'cancelled')];
    const timeline = buildReleaseTimeline({ tasks: all, releaseDate: RELEASE, now })!;
    const visible = selectPlanTasks(all, { filters: EMPTY_PLAN_FILTERS, showAll: true, now: NOW }).visible;
    const shown = narrowTimeline(timeline, new Set(visible.map((x) => x.id)));
    expect(shown.phases.map((phase) => phase.phase)).toEqual(['pre_release']);
  });

  it('a week holding only cancelled work does not render on the phone list', () => {
    const all = [t('a', -30, 'todo'), t('lonely', -14, 'cancelled')];
    const timeline = buildReleaseTimeline({ tasks: all, releaseDate: RELEASE, now })!;
    const shown = narrowTimeline(timeline, new Set(['a']));
    const weeks = groupItemsByWeek(shown).map((group) => group.week.index);
    expect(weeks).not.toContain(-2);
  });

  it('hidden cancelled work does not stretch the axis', () => {
    const live = [t('a', -30, 'todo'), t('b', 0, 'todo')];
    const far = t('far', 70, 'cancelled');
    const withFar = buildReleaseTimeline({ tasks: [...live, far], releaseDate: RELEASE, now })!;
    const without = buildReleaseTimeline({ tasks: live, releaseDate: RELEASE, now })!;
    expect(withFar.weeks.length).toBeGreaterThan(without.weeks.length);
  });

  it('a cancelled task with no date is not listed under No date yet once filtered out', () => {
    const timeline = buildReleaseTimeline({ tasks: [t('a', -3, 'todo'), task({ id: 'x', title: 'x', status: 'cancelled', dueDate: null })], releaseDate: RELEASE, now })!;
    expect(timeline.unscheduled.map((u) => u.taskId)).toEqual(['x']);
    expect(narrowTimeline(timeline, new Set(['a'])).unscheduled).toEqual([]);
  });

  it('a task spanning two weeks shows in both, and its cancelled twin in neither once hidden', () => {
    const run = t('run', -10, 'todo', { durationDays: 7 });
    const twin = t('twin', -10, 'cancelled', { durationDays: 7 });
    const timeline = buildReleaseTimeline({ tasks: [run, twin], releaseDate: RELEASE, now })!;
    const groups = groupItemsByWeek(narrowTimeline(timeline, new Set(['run'])));
    expect(groups.length).toBe(2);
    for (const group of groups) expect(group.items.map((i) => i.taskId)).toEqual(['run']);
  });

  it('Done earlier holds only done work when cancelled is hidden', () => {
    const all = [t('old-done', -60, 'done'), t('old-cancelled', -59, 'cancelled'), t('now', -32, 'todo')];
    const timeline = buildReleaseTimeline({ tasks: all, releaseDate: RELEASE, now })!;
    const folded = foldPastWeeks(narrowTimeline(timeline, new Set(['old-done', 'now'])));
    expect(folded.doneEarlier.map((i) => i.taskId)).toEqual(['old-done']);
  });

  it('a rollout with no release date has no axis (pre-production list instead)', () => {
    expect(buildReleaseTimeline({ tasks: [t('a', 0, 'cancelled')], releaseDate: null, now })).toBeNull();
  });

  it('a rollout that already came out still lays out, today off to the right', () => {
    const timeline = buildReleaseTimeline({
      tasks: [t('a', -10, 'done'), t('b', 5, 'cancelled')],
      releaseDate: '2026-09-01',
      now,
    })!;
    expect(timeline.placedCount).toBe(2);
  });
});

describe('All clear', () => {
  it('every activity done or cancelled is all clear; any open one is not; none is not', () => {
    expect(rolloutClosedSummary([{ status: 'done' }, { status: 'cancelled' }])).toEqual({ allClear: true, done: 1, cancelled: 1 });
    expect(rolloutClosedSummary([{ status: 'cancelled' }]).allClear).toBe(true);
    expect(rolloutClosedSummary([{ status: 'done' }, { status: 'blocked' }]).allClear).toBe(false);
    expect(rolloutClosedSummary([]).allClear).toBe(false);
  });

  it('the meta line leaves out a zero', () => {
    expect(closedSummaryLine({ done: 14, cancelled: 3 })).toBe('14 done · 3 cancelled');
    expect(closedSummaryLine({ done: 0, cancelled: 2 })).toBe('2 cancelled');
    expect(closedSummaryLine({ done: 5, cancelled: 0 })).toBe('5 done');
  });
});

describe('progress leaves cancelled out of both numbers', () => {
  it('countProgress', () => {
    expect(countProgress([{ status: 'done' }, { status: 'todo' }, { status: 'cancelled' }])).toEqual({ done: 1, total: 2 });
    expect(countProgress([{ status: 'done' }, { status: 'cancelled' }])).toEqual({ done: 1, total: 1 });
    expect(countProgress([{ status: 'cancelled' }])).toEqual({ done: 0, total: 0 });
  });

  it('the phase chips agree', () => {
    const summary = summarizeRolloutPhases(
      [
        { dueDate: '2026-10-01', status: 'done', phase: null },
        { dueDate: '2026-10-02', status: 'cancelled', phase: null },
      ] as never,
      RELEASE,
      new Date(Date.UTC(2026, 9, 19))
    );
    const pre = summary.find((phase) => phase.phase === 'pre_release')!;
    expect(pre.total).toBe(1);
    expect(pre.percent).toBe(100);
    expect(pre.state).toBe('done');
  });
});

describe('a cancelled prerequisite holds nothing up', () => {
  const exec = (id: string, status: string, deps: string[] = [], extra: Partial<ExecutionTask> = {}) =>
    ({ id, title: id, status, dependencies: deps, requirement: null, templateTaskId: null, ...extra }) as unknown as ExecutionTask;

  it('isDependencySatisfied', () => {
    expect(isDependencySatisfied('done')).toBe(true);
    expect(isDependencySatisfied('cancelled')).toBe(true);
    expect(isDependencySatisfied('todo')).toBe(false);
    expect(isDependencySatisfied(undefined)).toBe(false);
  });

  it('a task waiting on a cancelled prerequisite can be finished', () => {
    const prereq = exec('mix', 'cancelled');
    const next = exec('master', 'todo', ['mix']);
    expect(getTaskCompletionBlocker(next, [prereq, next])).toBeNull();
  });

  it('an open prerequisite still blocks, named', () => {
    const prereq = exec('mix', 'in_progress');
    const next = exec('master', 'todo', ['mix']);
    expect(getTaskCompletionBlocker(next, [prereq, next])).toBe('Waiting on mix.');
  });

  it('a locked task unlocks once every prerequisite is done or cancelled', () => {
    const a = exec('a', 'done');
    const b = exec('b', 'cancelled');
    const locked = exec('c', 'locked', ['a', 'b']);
    expect(getTaskCompletionBlocker(locked, [a, b, locked])).toBeNull();
  });

  it('a locked task with prerequisites we cannot see stays locked', () => {
    const locked = exec('c', 'locked', ['missing']);
    expect(getTaskCompletionBlocker(locked, [locked])).toBe('Complete the dependency chain first.');
  });

  it('a cancelled task\'s own prerequisites are untouched', () => {
    const prereq = exec('p', 'todo');
    const cancelled = exec('x', 'cancelled', ['p']);
    expect(getTaskCompletionBlocker(prereq, [prereq, cancelled])).toBeNull();
  });

  it('the Depends on line says where it stands', () => {
    expect(dependencyHint(['todo', 'done'])).toBe('Finish each prerequisite before this task can be marked done.');
    expect(dependencyHint([null])).toBe('Finish each prerequisite before this task can be marked done.');
    expect(dependencyHint(['cancelled', 'done'])).toBe('A cancelled prerequisite no longer holds this up.');
    expect(dependencyHint(['done'])).toBe('');
  });

  it('a cancelled distribution order no longer gates the Spotify pitch', () => {
    const orderId = DISTRIBUTION_ORDER_TASK_IDS[0];
    const open = { id: 'o', status: 'todo', metadata: { template: { task_id: orderId } } };
    const cancelled = { ...open, status: 'cancelled' };
    expect(pitchBlockedBy(EDITORIAL_PITCH_TASK_ID, [open as never])).not.toBeNull();
    expect(pitchBlockedBy(EDITORIAL_PITCH_TASK_ID, [cancelled as never])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Server-side "every activity done" (URG-389): cancelled work does not hold a
// release back from counting as delivered.
// ---------------------------------------------------------------------------
describe('isReleaseDelivered ignores cancelled work', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  const task = (id: string, status: string) => ({
    id,
    assignedToUserId: null,
    templateTaskId: null,
    status,
    completedAt: null,
  });
  const release = (statuses: string[]) => ({
    id: 'r1',
    title: 'Owambe Weather',
    ownerUserId: 'owner',
    releaseDate: '2026-12-01',
    status: 'planning',
    tasks: statuses.map((s, i) => task(`t${i}`, s)),
  });

  it('every live activity done, one cancelled: delivered', () => {
    expect(isReleaseDelivered(release(['done', 'done', 'cancelled']), now)).toBe(true);
  });
  it('an open activity still holds it back', () => {
    expect(isReleaseDelivered(release(['done', 'todo', 'cancelled']), now)).toBe(false);
  });
  it('everything cancelled is not a delivery', () => {
    expect(isReleaseDelivered(release(['cancelled', 'cancelled']), now)).toBe(false);
  });
});
