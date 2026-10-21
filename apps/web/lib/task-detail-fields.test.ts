import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  dueDateOnlyValue,
  dueDateTimeLocalValue,
  isDateOnlyDue,
  selectableTaskStatuses,
} from './task-detail-fields';

describe('isDateOnlyDue', () => {
  it('reads a plan date (UTC midnight) and a bare day as date-only', () => {
    expect(isDateOnlyDue('2026-09-24T00:00:00.000Z')).toBe(true);
    expect(isDateOnlyDue('2026-09-24T00:00:00+00:00')).toBe(true);
    expect(isDateOnlyDue('2026-09-24')).toBe(true);
  });
  it('reads a real time of day as not date-only', () => {
    expect(isDateOnlyDue('2026-09-24T09:30:00.000Z')).toBe(false);
    expect(isDateOnlyDue('2026-09-24T00:00:01.000Z')).toBe(false);
  });
  it('is false for nothing or junk', () => {
    expect(isDateOnlyDue(null)).toBe(false);
    expect(isDateOnlyDue('')).toBe(false);
    expect(isDateOnlyDue('soon')).toBe(false);
  });
});

describe('due input values', () => {
  it('a date-only value is the stored UTC day, whatever zone the viewer is in', () => {
    expect(dueDateOnlyValue('2026-09-24T00:00:00.000Z')).toBe('2026-09-24');
    expect(dueDateOnlyValue(null)).toBe('');
    expect(dueDateOnlyValue('junk')).toBe('');
  });
  it('the time input keeps its local conversion', () => {
    const value = dueDateTimeLocalValue('2026-09-24T09:30:00.000Z');
    expect(value).toMatch(/^2026-09-2[345]T\d\d:\d\d$/);
    expect(dueDateTimeLocalValue(null)).toBe('');
  });
});

describe('selectableTaskStatuses', () => {
  it('does not offer Locked as a choice', () => {
    expect(selectableTaskStatuses('todo')).not.toContain('locked');
    expect(selectableTaskStatuses('done')).not.toContain('locked');
  });
  it('still shows Locked while the activity is locked', () => {
    expect(selectableTaskStatuses('locked')).toContain('locked');
  });
});

describe('the pop-up uses them', () => {
  const source = readFileSync(join(__dirname, '..', 'components', 'tasks', 'TaskDetailView.tsx'), 'utf8');
  it('draws a day-only input for a date-only due date and filters the status menu', () => {
    expect(source).toContain('isDateOnlyDue(task.dueDate)');
    expect(source).toContain('selectableTaskStatuses(task.status)');
  });
});
