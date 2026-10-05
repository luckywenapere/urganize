import { describe, expect, it } from 'vitest';
import { describeWallSummary, wallStatTiles } from './wall-summary';

describe('describeWallSummary', () => {
  it('names all three with no Oxford comma', () => {
    expect(describeWallSummary({ rollouts: 12, activities: 111, teammates: 4 })).toBe(
      'Your 12 rollouts, 111 activities and 4 teammates are exactly where you left them.'
    );
  });

  it('uses the singular for one of each and the matching verb', () => {
    expect(describeWallSummary({ rollouts: 1, activities: null, teammates: null })).toBe(
      'Your 1 rollout is exactly where you left it.'
    );
    expect(describeWallSummary({ rollouts: 1, activities: 1, teammates: 1 })).toBe(
      'Your 1 rollout, 1 activity and 1 teammate are exactly where you left them.'
    );
  });

  it('leaves out zero and unreadable counts, never guessing', () => {
    expect(describeWallSummary({ rollouts: 3, activities: 0, teammates: null })).toBe(
      'Your 3 rollouts are exactly where you left them.'
    );
  });

  it('says nothing when there is nothing to say', () => {
    expect(describeWallSummary({ rollouts: 0, activities: null, teammates: 0 })).toBeNull();
    expect(describeWallSummary({ rollouts: null, activities: null, teammates: null })).toBeNull();
  });

  it('never uses an em dash or the word workspace', () => {
    expect(describeWallSummary({ rollouts: 5, activities: 9, teammates: 2 })).not.toMatch(/—|workspace/i);
  });
});

describe('wallStatTiles', () => {
  it('skips zero and unreadable counts and pluralises', () => {
    expect(wallStatTiles({ rollouts: 1, activities: 64, teammates: 0 })).toEqual([
      { value: 1, label: 'rollout' },
      { value: 64, label: 'activities' },
    ]);
    expect(wallStatTiles({ rollouts: null, activities: null, teammates: null })).toEqual([]);
  });
});
