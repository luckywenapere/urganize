import { describe, expect, it } from 'vitest';
import { GRANT_EVAL_CASES } from './eval-cases';
import { buildGrantQueries, readGrantFacts } from './query-builder';

// The evaluation's case set is facts about a KIND of artist, never a person. Every
// case must survive the allowlist whole, or the run would quietly test something
// other than what it says.

describe('GRANT_EVAL_CASES', () => {
  it('has 20 cases across the plan\'s four groups, 8, 4, 4 and 4', () => {
    expect(GRANT_EVAL_CASES).toHaveLength(20);
    const count = (group: string) => GRANT_EVAL_CASES.filter((c) => c.group === group).length;
    expect([count('nigeria'), count('africa'), count('abroad'), count('stage_need')]).toEqual([8, 4, 4, 4]);
  });

  it('gives every case a unique id', () => {
    expect(new Set(GRANT_EVAL_CASES.map((c) => c.id)).size).toBe(20);
  });

  it('keeps every fact through the allowlist, so nothing is silently dropped', () => {
    for (const testCase of GRANT_EVAL_CASES) {
      expect(readGrantFacts(testCase.facts)).toEqual(testCase.facts);
      expect('error' in buildGrantQueries(testCase.facts)).toBe(false);
    }
  });
});
