import { describe, expect, it } from 'vitest';
import { readPlannedByUrgans, writePlannedByUrgans } from './release-planned-by-urgans';

describe('readPlannedByUrgans', () => {
  it('is true only for a literal true under the key', () => {
    expect(readPlannedByUrgans({ planned_by_urgans: true })).toBe(true);
  });

  it('is false for an absent key', () => {
    expect(readPlannedByUrgans({})).toBe(false);
    expect(readPlannedByUrgans({ planner_pending: true })).toBe(false);
  });

  it('is false for missing or non-object metadata', () => {
    expect(readPlannedByUrgans(null)).toBe(false);
    expect(readPlannedByUrgans(undefined)).toBe(false);
  });

  it('is false for junk values under the key', () => {
    expect(readPlannedByUrgans({ planned_by_urgans: 'true' })).toBe(false);
    expect(readPlannedByUrgans({ planned_by_urgans: 1 })).toBe(false);
    expect(readPlannedByUrgans({ planned_by_urgans: {} })).toBe(false);
    expect(readPlannedByUrgans({ planned_by_urgans: [] })).toBe(false);
    expect(readPlannedByUrgans({ planned_by_urgans: false })).toBe(false);
  });
});

describe('writePlannedByUrgans', () => {
  it('marks a fresh metadata object', () => {
    expect(writePlannedByUrgans(null, true)).toEqual({ planned_by_urgans: true });
    expect(writePlannedByUrgans(undefined, true)).toEqual({ planned_by_urgans: true });
  });

  it('preserves every sibling key when marking', () => {
    // The reason the helper exists: `metadata` is one shared JSONB column, so
    // a write that returns { planned_by_urgans: true } alone would silently
    // drop planner_pending and anything else stored beside it.
    const result = writePlannedByUrgans({ planner_pending: true, x: 'y' }, true);
    expect(result).toEqual({ planner_pending: true, x: 'y', planned_by_urgans: true });
  });

  it('never mutates the input object', () => {
    const input: Record<string, unknown> = { planner_pending: true };
    writePlannedByUrgans(input, true);
    expect(input).toEqual({ planner_pending: true });
  });

  it('clears by DELETING the key, not storing false', () => {
    const result = writePlannedByUrgans({ planned_by_urgans: true, planner_pending: true }, false);
    expect('planned_by_urgans' in result).toBe(false);
    expect(result).toEqual({ planner_pending: true });
  });

  it('clearing an unmarked object is a no-op shape', () => {
    expect(writePlannedByUrgans({ x: 'y' }, false)).toEqual({ x: 'y' });
    expect(writePlannedByUrgans(null, false)).toEqual({});
  });
});
