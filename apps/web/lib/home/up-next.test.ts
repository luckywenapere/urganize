import { describe, expect, it } from 'vitest';
import { pickUpNext } from './up-next';
import type { HomeNextShow } from './types';

const show = { id: 's1', artistName: 'Dorian', venueName: 'Quilox', city: 'Lagos', dateLabel: 'Fri 9 Oct', setTimeLabel: '11:00 PM', daysUntil: 5, setlist: null } as HomeNextShow;
const release = (id: string, daysOut: number | null) => ({ id, title: id, artistName: 'Dorian', daysOut });

describe('pickUpNext', () => {
  it('offers the coming show first', () => {
    const next = pickUpNext(show, [release('r', 3)]);
    expect(next.kind).toBe('show');
    expect(next.href).toBe('/dashboard/shows/s1');
    expect(next.title).toBe('Dorian plays Quilox, Lagos');
  });

  it('falls back to the rollout that comes out soonest, ignoring past and undated ones', () => {
    const next = pickUpNext(null, [release('past', -4), release('undated', null), release('far', 40), release('soon', 6)]);
    expect(next.kind).toBe('release');
    expect(next.href).toBe('/dashboard?release=soon');
    expect(next.detail).toBe('Dorian · out in 6 days');
  });

  it('says out today and uses the singular for one day', () => {
    expect(pickUpNext(null, [release('a', 0)]).detail).toBe('Dorian · out today');
    expect(pickUpNext(null, [release('a', 1)]).detail).toBe('Dorian · out in 1 day');
  });

  it('asks the manager to start a rollout when nothing is coming', () => {
    const next = pickUpNext(null, [release('past', -2)]);
    expect(next.kind).toBe('start');
    expect(next.action).toBe('Start a rollout');
  });

  it('does not reorder the list it is given', () => {
    const list = [release('b', 9), release('a', 2)];
    pickUpNext(null, list);
    expect(list.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('never uses an em dash', () => {
    for (const next of [pickUpNext(show, []), pickUpNext(null, [release('a', 2)]), pickUpNext(null, [])]) {
      expect(`${next.title} ${next.detail} ${next.action}`).not.toMatch(/—/);
    }
  });
});
