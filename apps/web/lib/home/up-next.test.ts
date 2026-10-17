import { describe, expect, it } from 'vitest';
import { pickUpNext } from './up-next';

const release = (id: string, daysOut: number | null) => ({ id, title: id, artistName: 'Dorian', daysOut });

describe('pickUpNext', () => {
  it('offers the rollout that comes out soonest, ignoring past and undated ones', () => {
    const next = pickUpNext([release('past', -4), release('undated', null), release('far', 40), release('soon', 6)]);
    expect(next.kind).toBe('release');
    expect(next.href).toBe('/dashboard?release=soon');
    expect(next.detail).toBe('Dorian · out in 6 days');
  });

  it('says out today and uses the singular for one day', () => {
    expect(pickUpNext([release('a', 0)]).detail).toBe('Dorian · out today');
    expect(pickUpNext([release('a', 1)]).detail).toBe('Dorian · out in 1 day');
  });

  it('asks the manager to start a rollout when nothing is coming', () => {
    const next = pickUpNext([release('past', -2)]);
    expect(next.kind).toBe('start');
    expect(next.action).toBe('Start a rollout');
  });

  it('does not reorder the list it is given', () => {
    const list = [release('b', 9), release('a', 2)];
    pickUpNext(list);
    expect(list.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('never uses an em dash', () => {
    for (const next of [pickUpNext([release('a', 2)]), pickUpNext([])]) {
      expect(`${next.title} ${next.detail} ${next.action}`).not.toMatch(/—/);
    }
  });
});
