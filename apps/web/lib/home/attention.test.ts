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

  it('never returns an item with a zero count', () => {
    const items = buildAttentionItems({ ...empty, yourTasks: { late: [task('a')], today: [], week: [] } });
    expect(items.every((item) => item.count > 0)).toBe(true);
  });

  it('puts overdue before due today before good news', () => {
    const items = buildAttentionItems({
      ...empty,
      yourTasks: { late: [task('a')], today: [task('b')], week: [] },
      placements: { placed: [{ id: 'p' } as never], underReview: [] },
    });
    expect(items.map((item) => item.key)).toEqual(['late', 'today', 'placements']);
  });

  it('uses the right grammar for one and many', () => {
    const one = buildAttentionItems({ ...empty, yourTasks: { late: [task('a')], today: [], week: [] } });
    const many = buildAttentionItems({ ...empty, yourTasks: { late: [task('a'), task('b')], today: [], week: [] } });
    expect(one[0].title).toBe('1 task is overdue');
    expect(many[0].title).toBe('2 tasks are overdue');
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
