import { describe, expect, it } from 'vitest';
import { isRecapEligible, parseRecapInputs } from './recap-eligibility';

const NOW = new Date('2026-08-09T12:00:00Z');
const noTasks = { totalTasks: 0, allTasksDone: false };
const openTasks = { totalTasks: 10, allTasksDone: false };
const allDone = { totalTasks: 10, allTasksDone: true };

describe('isRecapEligible', () => {
  it('allows a release whose date has passed', () => {
    expect(isRecapEligible({ releaseDate: '2026-07-01', status: 'draft' }, openTasks, NOW)).toBe(true);
  });

  it('allows a release on its release day', () => {
    expect(isRecapEligible({ releaseDate: '2026-08-09', status: 'draft' }, openTasks, NOW)).toBe(true);
  });

  it('blocks a future release with open tasks', () => {
    expect(isRecapEligible({ releaseDate: '2026-12-01', status: 'draft' }, openTasks, NOW)).toBe(false);
  });

  it('allows a future release once every task is done', () => {
    expect(isRecapEligible({ releaseDate: '2026-12-01', status: 'draft' }, allDone, NOW)).toBe(true);
  });

  it('allows a dateless release once every task is done', () => {
    expect(isRecapEligible({ releaseDate: null, status: 'draft' }, allDone, NOW)).toBe(true);
  });

  it('blocks a dateless release with open tasks', () => {
    expect(isRecapEligible({ releaseDate: null, status: 'draft' }, openTasks, NOW)).toBe(false);
  });

  it('blocks a dateless release with no tasks at all', () => {
    expect(isRecapEligible({ releaseDate: null, status: 'draft' }, noTasks, NOW)).toBe(false);
  });

  it('allows a released or archived status regardless of date', () => {
    expect(isRecapEligible({ releaseDate: '2027-01-01', status: 'released' }, openTasks, NOW)).toBe(true);
    expect(isRecapEligible({ releaseDate: null, status: 'archived' }, noTasks, NOW)).toBe(true);
  });
});

describe('parseRecapInputs', () => {
  it('accepts an empty body, since both fields are optional', () => {
    expect(parseRecapInputs({})).toEqual({ inputs: { firstWeekStreams: null, highlight: null } });
  });

  it('accepts a numeric stream count', () => {
    expect(parseRecapInputs({ firstWeekStreams: 12400 })).toEqual({
      inputs: { firstWeekStreams: 12400, highlight: null },
    });
  });

  it('accepts a numeric stream count sent as a string', () => {
    expect(parseRecapInputs({ firstWeekStreams: ' 12400 ' })).toEqual({
      inputs: { firstWeekStreams: 12400, highlight: null },
    });
  });

  it('treats an empty string as not provided', () => {
    expect(parseRecapInputs({ firstWeekStreams: '', highlight: '' })).toEqual({
      inputs: { firstWeekStreams: null, highlight: null },
    });
  });

  it('rejects negative, fractional and non-numeric stream counts', () => {
    expect(parseRecapInputs({ firstWeekStreams: -5 })).toHaveProperty('error');
    expect(parseRecapInputs({ firstWeekStreams: 1.5 })).toHaveProperty('error');
    expect(parseRecapInputs({ firstWeekStreams: 'lots' })).toHaveProperty('error');
  });

  it('rejects an absurdly large stream count', () => {
    expect(parseRecapInputs({ firstWeekStreams: 9_000_000_000_000 })).toHaveProperty('error');
  });

  it('sanitizes the highlight before storing it', () => {
    const result = parseRecapInputs({ highlight: 'Sold out the show — twice' });
    expect(result).toEqual({
      inputs: { firstWeekStreams: null, highlight: 'Sold out the show, twice' },
    });
  });

  it('rejects a highlight over the character limit', () => {
    expect(parseRecapInputs({ highlight: 'a'.repeat(141) })).toHaveProperty('error');
  });

  it('rejects a non-string highlight', () => {
    expect(parseRecapInputs({ highlight: 42 })).toHaveProperty('error');
  });
});
