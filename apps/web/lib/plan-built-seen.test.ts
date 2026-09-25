import { describe, expect, it } from 'vitest';

import {
  PLAN_BUILT_SEEN_MAX_MARKED,
  hasSeenPlanBuilt,
  isSeenList,
  markSeenPlanBuilt,
} from './plan-built-seen';

describe('plan-built-seen', () => {
  it('validates the stored shape strictly', () => {
    expect(isSeenList(['a', 'b'])).toBe(true);
    expect(isSeenList([])).toBe(true);
    expect(isSeenList(['a', 1])).toBe(false);
    expect(isSeenList('a')).toBe(false);
    expect(isSeenList(null)).toBe(false);
  });

  it('reports seen only for a release in the list, and never for a malformed one', () => {
    expect(hasSeenPlanBuilt(['r1', 'r2'], 'r2')).toBe(true);
    expect(hasSeenPlanBuilt(['r1'], 'r2')).toBe(false);
    expect(hasSeenPlanBuilt(null, 'r1')).toBe(false);
    expect(hasSeenPlanBuilt({ r1: true }, 'r1')).toBe(false);
  });

  it('appends newest last without duplicating', () => {
    expect(markSeenPlanBuilt(['r1'], 'r2')).toEqual(['r1', 'r2']);
    expect(markSeenPlanBuilt(['r1', 'r2'], 'r1')).toEqual(['r2', 'r1']);
  });

  it('starts fresh from a malformed stored value', () => {
    expect(markSeenPlanBuilt('junk', 'r1')).toEqual(['r1']);
    expect(markSeenPlanBuilt(undefined, 'r1')).toEqual(['r1']);
  });

  it('caps the list, dropping the oldest', () => {
    const full = Array.from({ length: PLAN_BUILT_SEEN_MAX_MARKED }, (_, i) => `r${i}`);
    const next = markSeenPlanBuilt(full, 'new');
    expect(next).toHaveLength(PLAN_BUILT_SEEN_MAX_MARKED);
    expect(next[0]).toBe('r1');
    expect(next[next.length - 1]).toBe('new');
  });
});
