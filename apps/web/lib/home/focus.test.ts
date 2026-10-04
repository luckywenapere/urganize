import { describe, expect, it } from 'vitest';
import { pickFocusTask, withoutTask } from './focus';
import type { HomeTaskItem } from './types';

const task = (id: string, over: Partial<HomeTaskItem> = {}): HomeTaskItem => ({
  id,
  title: id,
  releaseId: null,
  releaseTitle: null,
  artistName: null,
  dueDate: '2026-09-01',
  status: 'todo',
  priority: 'none',
  assigneeName: null,
  assignerName: null,
  ...over,
});

describe('pickFocusTask', () => {
  it('returns null when there is nothing to do', () => {
    expect(pickFocusTask({ late: [], today: [], week: [] })).toBeNull();
  });

  it('prefers late over today over this week', () => {
    const picked = pickFocusTask({ late: [task('l')], today: [task('t', { priority: 'urgent' })], week: [task('w')] });
    expect(picked?.task.id).toBe('l');
    expect(picked?.group).toBe('late');
    expect(pickFocusTask({ late: [], today: [task('t')], week: [task('w')] })?.group).toBe('today');
    expect(pickFocusTask({ late: [], today: [], week: [task('w')] })?.group).toBe('week');
  });

  it('takes the highest priority, then the oldest due date', () => {
    const picked = pickFocusTask({
      late: [
        task('old-low', { priority: 'low', dueDate: '2026-01-01' }),
        task('new-high', { priority: 'high', dueDate: '2026-09-20' }),
        task('old-high', { priority: 'high', dueDate: '2026-08-01' }),
      ],
      today: [],
      week: [],
    });
    expect(picked?.task.id).toBe('old-high');
    expect(picked?.groupSize).toBe(3);
  });

  it('puts an undated task after a dated one and breaks a full tie by title', () => {
    const undated = pickFocusTask({ late: [task('b', { dueDate: null }), task('a')], today: [], week: [] });
    expect(undated?.task.id).toBe('a');
    const tie = pickFocusTask({ late: [task('b'), task('a')], today: [], week: [] });
    expect(tie?.task.id).toBe('a');
  });

  it('does not change the order of the list it is given', () => {
    const late = [task('b'), task('a')];
    pickFocusTask({ late, today: [], week: [] });
    expect(late.map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('withoutTask', () => {
  it('removes only that task from every group', () => {
    const result = withoutTask({ late: [task('a'), task('b')], today: [task('c')], week: [] }, 'a');
    expect(result.late.map((t) => t.id)).toEqual(['b']);
    expect(result.today.map((t) => t.id)).toEqual(['c']);
  });

  it('returns the input untouched when there is no focus task', () => {
    const input = { late: [task('a')], today: [], week: [] };
    expect(withoutTask(input, null)).toBe(input);
  });
});
