import { describe, expect, it } from 'vitest';
import { emptyPhaseText, plainDueLabel } from './activity-columns';

// Local noon on 11 Nov 2026, so "today" is the same calendar day everywhere.
const NOW = new Date(2026, 10, 11, 12, 0, 0);

function task(over: Partial<Parameters<typeof plainDueLabel>[0]> = {}) {
  return { dueDate: null, completedAt: null, compressedRunway: false, status: 'todo', ...over };
}

describe('plainDueLabel', () => {
  it('says Today and Tomorrow in plain words', () => {
    expect(plainDueLabel(task({ dueDate: '2026-11-11' }), NOW)).toEqual({ label: 'Today', tone: 'normal' });
    expect(plainDueLabel(task({ dueDate: '2026-11-12T00:00:00Z' }), NOW)).toEqual({ label: 'Tomorrow', tone: 'normal' });
  });

  it('gives the date for anything further out', () => {
    expect(plainDueLabel(task({ dueDate: '2026-11-21' }), NOW)).toEqual({ label: '21 Nov', tone: 'normal' });
  });

  it('adds the year when the date is in another year', () => {
    expect(plainDueLabel(task({ dueDate: '2027-01-05' }), NOW).label).toBe('5 Jan 2027');
  });

  it('is red only when late', () => {
    expect(plainDueLabel(task({ dueDate: '2026-11-09' }), NOW)).toEqual({ label: '9 Nov', tone: 'late' });
    expect(plainDueLabel(task({ dueDate: '2026-11-10' }), NOW)).toEqual({ label: 'Yesterday', tone: 'late' });
  });

  it('keeps a catch-up activity from a short runway quiet, not late', () => {
    expect(plainDueLabel(task({ dueDate: '2026-11-09', compressedRunway: true }), NOW)).toEqual({
      label: '9 Nov',
      tone: 'normal',
    });
  });

  it('says Done and Cancelled for closed work, whatever the date', () => {
    expect(plainDueLabel(task({ dueDate: '2026-11-01', status: 'done' }), NOW)).toEqual({ label: 'Done', tone: 'quiet' });
    expect(plainDueLabel(task({ status: 'cancelled' }), NOW)).toEqual({ label: 'Cancelled', tone: 'quiet' });
  });

  it('falls back to the plan timing, then to No date', () => {
    expect(plainDueLabel(task({ relativeWhen: '2 weeks before release' }), NOW)).toEqual({
      label: '2 weeks before release',
      tone: 'quiet',
    });
    expect(plainDueLabel(task(), NOW)).toEqual({ label: 'No date', tone: 'quiet' });
  });
});

describe('emptyPhaseText', () => {
  it('puts the dates before the words', () => {
    expect(emptyPhaseText('Until 5 Nov')).toBe('Until 5 Nov · nothing planned');
  });

  it('stands alone when the phase has no dates', () => {
    expect(emptyPhaseText('')).toBe('Nothing planned');
  });
});
