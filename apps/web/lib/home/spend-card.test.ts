import { describe, expect, it } from 'vitest';
import { orderSpendCardRollouts, spendSceneHref } from './spend-card';

const rollout = (id: string, daysOut: number | null) => ({ id, title: id, artistName: 'A', daysOut });

describe('orderSpendCardRollouts', () => {
  it('puts the next one coming out first, then the most recent out, then undated', () => {
    const ordered = orderSpendCardRollouts([
      rollout('undated', null),
      rollout('out-long-ago', -30),
      rollout('later', 40),
      rollout('out-yesterday', -1),
      rollout('soon', 3),
    ]);
    expect(ordered.map((r) => r.id)).toEqual(['soon', 'later', 'out-yesterday', 'out-long-ago', 'undated']);
  });

  it('counts release day itself as coming up', () => {
    expect(orderSpendCardRollouts([rollout('past', -2), rollout('today', 0)])[0]?.id).toBe('today');
  });

  it('keeps the given order for ties', () => {
    expect(orderSpendCardRollouts([rollout('a', null), rollout('b', null)]).map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('spendSceneHref', () => {
  it('opens the Spend scene of the rollout', () => {
    expect(spendSceneHref('r1')).toBe('/dashboard?release=r1&scene=spend');
  });

  it('opens it with the add form when asked', () => {
    expect(spendSceneHref('r1', { add: true })).toBe('/dashboard?release=r1&scene=spend&field=add');
  });
});
