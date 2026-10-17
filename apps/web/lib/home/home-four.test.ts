import { describe, expect, it } from 'vitest';
import {
  buildOneThing,
  buildPhaseLine,
  describeDone,
  describeDrop,
  describeTaskLabel,
  describeTaskWhere,
  describeWaiting,
  pickHeaderRelease,
  pickHomeLayout,
} from './home-four';
import type { HomeReleaseSummary, HomeTaskItem } from './types';

const release = (over: Partial<HomeReleaseSummary>): HomeReleaseSummary => ({
  id: 'r1',
  title: 'Lagos Nights',
  artistId: 'a1',
  artistName: 'Solid',
  releaseType: 'single' as HomeReleaseSummary['releaseType'],
  releaseDate: '2026-10-28',
  daysOut: 12,
  isSoon: true,
  progress: { done: 10, total: 40 },
  week: null,
  slippingCount: 0,
  yourDone: 0,
  yourTotal: 0,
  teamSize: 1,
  ...over,
});

const task = (id: string, dueDate: string | null, priority: HomeTaskItem['priority'] = 'medium'): HomeTaskItem => ({
  id,
  title: `Task ${id}`,
  releaseId: 'r1',
  releaseTitle: 'Lagos Nights',
  artistName: 'Solid',
  dueDate,
  status: 'todo' as HomeTaskItem['status'],
  priority,
  assigneeName: null,
  assignerName: null,
});

describe('pickHomeLayout', () => {
  it('a rollout in flight always draws the release Home', () => {
    expect(pickHomeLayout('manager_new', 1)).toBe('release');
    expect(pickHomeLayout('label_gap', 2)).toBe('release');
  });
  it('new accounts keep the welcome, everyone else gets between', () => {
    expect(pickHomeLayout('manager_new', 0)).toBe('new');
    expect(pickHomeLayout('manager_between', 0)).toBe('between');
    expect(pickHomeLayout('manager_all_clear', 0)).toBe('between');
  });
});

describe('pickHeaderRelease', () => {
  it('picks the next one out, then the latest past one', () => {
    const a = release({ id: 'a', daysOut: 30 });
    const b = release({ id: 'b', daysOut: 3 });
    const c = release({ id: 'c', daysOut: -2 });
    expect(pickHeaderRelease([a, b, c])?.id).toBe('b');
    expect(pickHeaderRelease([c, release({ id: 'd', daysOut: -9 })])?.id).toBe('c');
    expect(pickHeaderRelease([])).toBeNull();
  });
});

describe('describeDrop', () => {
  it('says Drops or Out, then the date', () => {
    expect(describeDrop({ daysOut: 12, releaseDate: '2026-10-28' })).toEqual({ lead: 'Drops', date: 'Wed 28 Oct' });
    expect(describeDrop({ daysOut: 1, releaseDate: '2026-10-17' }).lead).toBe('Drops');
    expect(describeDrop({ daysOut: 0, releaseDate: '2026-10-16' }).lead).toBe('Out');
    expect(describeDrop({ daysOut: -5, releaseDate: '2026-10-11' }).lead).toBe('Out');
    expect(describeDrop({ daysOut: null, releaseDate: null })).toEqual({ lead: 'No release date yet', date: '' });
  });
});

describe('buildPhaseLine', () => {
  it('lights the current phase and fills it to progress', () => {
    const line = buildPhaseLine({ daysOut: 30, progress: { done: 10, total: 40 } })!;
    expect(line.map((s) => s.active)).toEqual([true, false, false]);
    expect(line[0].fill).toBeCloseTo(0.25);
    const release = buildPhaseLine({ daysOut: 2, progress: { done: 0, total: 40 } })!;
    expect(release.map((s) => s.fill)).toEqual([1, 0.06, 0]);
  });
  it('no date, no line', () => {
    expect(buildPhaseLine({ daysOut: null, progress: { done: 0, total: 0 } })).toBeNull();
  });
});

describe('buildOneThing', () => {
  const now = new Date('2026-10-16T09:00:00Z');
  it('late first, then moves, then today, at most three', () => {
    const items = buildOneThing(
      {
        yourTasks: { late: [task('l1', '2026-10-10')], today: [task('t1', '2026-10-16'), task('t2', '2026-10-16')], week: [] },
        moves: [
          {
            key: 'm1',
            rule: 'build_plan' as never,
            releaseId: 'r1',
            releaseTitle: 'Lagos Nights',
            title: 'Build the plan',
            detail: 'x',
            action: 'Build',
            target: { kind: 'link', href: '/x' },
          },
        ],
      },
      now
    );
    expect(items.map((i) => i.key)).toEqual(['task-l1', 'move-m1', 'task-t1']);
  });
  it('a move pointing at a listed task is skipped', () => {
    const items = buildOneThing(
      {
        yourTasks: { late: [task('l1', '2026-10-10')], today: [], week: [] },
        moves: [
          {
            key: 'm1',
            rule: 'x' as never,
            releaseId: 'r1',
            releaseTitle: '',
            title: '',
            detail: '',
            action: '',
            target: { kind: 'task', releaseId: 'r1', taskId: 'l1' },
          },
        ],
      },
      now
    );
    expect(items).toHaveLength(1);
  });
  it('this week alone is not a next move', () => {
    expect(buildOneThing({ yourTasks: { late: [], today: [], week: [task('w', '2026-10-19')] }, moves: [] }, now)).toEqual([]);
  });
});

describe('describeWaiting', () => {
  it('counts late and on time, hides at zero', () => {
    expect(describeWaiting({ lateCount: 1, onTimeCount: 2 })).toEqual({ total: 3, late: 1 });
    expect(describeWaiting({ lateCount: 0, onTimeCount: 0 })).toBeNull();
  });
});

describe('golden layout B helpers', () => {
  it('labels the task card Next and its due day', () => {
    expect(describeTaskLabel({ label: 'Due today' })).toBe('Next · Due today');
    expect(describeTaskLabel({ label: 'Due tomorrow' })).toBe('Next · Due tomorrow');
    expect(describeTaskLabel({ label: 'No due date' })).toBe('Next');
    expect(describeTaskLabel(null)).toBe('Next');
  });

  it('names the release only when it is not the header\'s', () => {
    const task = { releaseId: 'r1', releaseTitle: 'Heaven', artistName: 'Dorian' };
    expect(describeTaskWhere(task, 'r1')).toBeNull();
    expect(describeTaskWhere(task, 'r2')).toBe('Heaven · Dorian');
    expect(describeTaskWhere({ releaseId: null, releaseTitle: null, artistName: null }, 'r1')).toBeNull();
  });

  it('Done hides at zero tasks', () => {
    expect(describeDone({ done: 12, total: 40 })).toEqual({ done: 12, total: 40 });
    expect(describeDone({ done: 0, total: 0 })).toBeNull();
    expect(describeDone(null)).toBeNull();
  });
});
