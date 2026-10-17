import { describe, expect, it } from 'vitest';
import { buildPlacementItems, buildTaskStack, buildWaitingItems } from './stack-items';
import type { HomePitchItem, HomeTaskItem, HomeWaitingTask } from './types';

function task(id: string, over: Partial<HomeTaskItem> = {}): HomeTaskItem {
  return {
    id,
    title: `Task ${id}`,
    releaseId: 'rel-1',
    releaseTitle: 'Ohema',
    artistName: 'Dorian',
    dueDate: '2026-10-07',
    status: 'todo',
    priority: 'medium',
    assigneeName: null,
    assignerName: null,
    ...over,
  };
}

function waiting(id: string): HomeWaitingTask {
  return { ...task(id), daysLate: 2 };
}

function pitch(id: string): HomePitchItem {
  return {
    id,
    releaseId: 'rel-1',
    releaseTitle: 'Ohema',
    playlistName: `Playlist ${id}`,
    curatorName: null,
    songTitle: 'Ohema',
    status: 'new',
    sentDaysAgo: 1,
  };
}

describe('buildTaskStack', () => {
  it('returns nothing when there are no tasks', () => {
    expect(buildTaskStack({ late: [], today: [], week: [] })).toBeNull();
  });

  it('puts the task to do first on top and never repeats it below', () => {
    const stack = buildTaskStack({
      late: [task('a', { priority: 'low' }), task('b', { priority: 'urgent' })],
      today: [task('c')],
      week: [task('d')],
    });
    expect(stack?.top.task.id).toBe('b');
    expect(stack?.rest.map((item) => item.id)).toEqual(['a', 'c', 'd']);
  });

  it('keeps late, then today, then this week behind the top card', () => {
    const stack = buildTaskStack({ late: [], today: [task('t1'), task('t2')], week: [task('w1')] });
    expect(stack?.top.group).toBe('today');
    expect(stack?.rest.map((item) => item.id)).toEqual(['t2', 'w1']);
  });
});

describe('buildWaitingItems', () => {
  it('lists late tasks with keys that never collide', () => {
    const items = buildWaitingItems([waiting('a'), waiting('b')]);
    expect(items.map((item) => item.kind)).toEqual(['task', 'task']);
    expect(new Set(items.map((item) => item.key)).size).toBe(2);
  });

  it('is empty when nothing is waiting', () => {
    expect(buildWaitingItems([])).toEqual([]);
  });
});

describe('buildPlacementItems', () => {
  it('puts placed pitches before the ones under review', () => {
    const items = buildPlacementItems({ placed: [pitch('p1')], underReview: [pitch('r1'), pitch('r2')] });
    expect(items.map((item) => [item.pitch.id, item.placed])).toEqual([
      ['p1', true],
      ['r1', false],
      ['r2', false],
    ]);
  });
});
