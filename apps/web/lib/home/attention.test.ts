import { describe, expect, it } from 'vitest';
import { buildAttentionItems, type AttentionInput } from './attention';

const task = (id: string) => ({ id }) as never;
const empty: AttentionInput = {
  yourTasks: { late: [], today: [], week: [] },
  waiting: { tasks: [], djLinks: [] },
  placements: { placed: [], underReview: [] },
  nextShow: null,
};

describe('buildAttentionItems', () => {
  it('returns nothing on a quiet day', () => {
    expect(buildAttentionItems(empty)).toEqual([]);
  });

  it('leaves task counts to the summary strip, so nothing is said twice', () => {
    const items = buildAttentionItems({
      ...empty,
      yourTasks: { late: [task('a')], today: [task('b')], week: [] },
      waiting: { tasks: [{ id: 'w' } as never], djLinks: [] },
    });
    expect(items).toEqual([]);
  });

  it('puts a long set before a DJ who has not opened the tracks before good news', () => {
    const items = buildAttentionItems({
      ...empty,
      waiting: { tasks: [], djLinks: [{ showId: 's' } as never] },
      placements: { placed: [{ id: 'p' } as never], underReview: [] },
      nextShow: { id: 's', artistName: 'Dorian', setlist: { fit: 'over' } } as never,
    });
    expect(items.map((item) => item.key)).toEqual(['setlist-over', 'dj-links', 'placements']);
    expect(items.every((item) => item.count > 0)).toBe(true);
  });

  it('uses the right grammar for one and many', () => {
    const one = buildAttentionItems({ ...empty, waiting: { tasks: [], djLinks: [{ showId: 's' } as never] } });
    const many = buildAttentionItems({ ...empty, waiting: { tasks: [], djLinks: [{ showId: 's' } as never, { showId: 't' } as never] } });
    expect(one[0].title).toBe('1 DJ has not opened the tracks');
    expect(many[0].title).toBe('2 DJs have not opened the tracks');
  });

  it('flags a set that runs over its slot, and only then', () => {
    const show = (fit: 'over' | 'under' | 'on_time') =>
      ({ id: 's1', artistName: 'Dorian', setlist: { fit, totalMinutes: 40, slotMinutes: 25, isPartial: false } }) as never;
    expect(buildAttentionItems({ ...empty, nextShow: show('over') }).map((i) => i.key)).toEqual(['setlist-over']);
    expect(buildAttentionItems({ ...empty, nextShow: show('on_time') })).toEqual([]);
  });

  it('never uses an em dash or the word workspace in copy', () => {
    const items = buildAttentionItems({
      yourTasks: { late: [task('a')], today: [task('b')], week: [] },
      waiting: { tasks: [{ id: 'w' } as never], djLinks: [{ showId: 's' } as never] },
      placements: { placed: [{ id: 'p' } as never], underReview: [] },
      nextShow: { id: 's', artistName: 'Dorian', setlist: { fit: 'over' } } as never,
    });
    for (const item of items) {
      expect(`${item.title} ${item.detail} ${item.action}`).not.toMatch(/\u2014|workspace/i);
    }
  });
});
