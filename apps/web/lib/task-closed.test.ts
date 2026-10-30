import { describe, expect, it } from 'vitest';
import { CLOSED_TASK_STATUSES, isTaskClosed, TASK_STATUS_OPTIONS } from '@/types/tasks';

describe('isTaskClosed (#883)', () => {
  it('closes done and cancelled, and nothing else', () => {
    expect(TASK_STATUS_OPTIONS.filter((status) => isTaskClosed(status))).toEqual([...CLOSED_TASK_STATUSES]);
  });

  it('reads stored values loosely, so a stray case or space never reopens a task', () => {
    expect(isTaskClosed(' Done ')).toBe(true);
    expect(isTaskClosed('CANCELLED')).toBe(true);
    expect(isTaskClosed(null)).toBe(false);
    expect(isTaskClosed('')).toBe(false);
  });
});
