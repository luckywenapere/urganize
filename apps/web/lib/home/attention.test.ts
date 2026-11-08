import { describe, expect, it } from 'vitest';
import { buildAttentionItems, type AttentionInput } from './attention';

const task = (id: string) => ({ id }) as never;
const empty: AttentionInput = {
  yourTasks: { late: [], today: [], week: [] },
  waiting: { tasks: [] },
  placements: { placed: [], underReview: [] },
};

describe('buildAttentionItems', () => {
  it('returns nothing on a quiet day', () => {
    expect(buildAttentionItems(empty)).toEqual([]);
  });

  it('leaves task counts to the summary strip, so nothing is said twice', () => {
    const items = buildAttentionItems({
      ...empty,
      yourTasks: { late: [task('a')], today: [task('b')], week: [] },
      waiting: { tasks: [{ id: 'w' } as never] },
    });
    expect(items).toEqual([]);
  });

  it('says when a playlist added the song', () => {
    const items = buildAttentionItems({
      ...empty,
      placements: { placed: [{ id: 'p' } as never], underReview: [] },
    });
    expect(items.map((item) => item.key)).toEqual(['placements']);
    expect(items.every((item) => item.count > 0)).toBe(true);
  });

  it('uses the right grammar for one and many', () => {
    const one = buildAttentionItems({ ...empty, placements: { placed: [{ id: 'p' } as never], underReview: [] } });
    const many = buildAttentionItems({
      ...empty,
      placements: { placed: [{ id: 'p' } as never, { id: 'q' } as never], underReview: [] },
    });
    expect(one[0].title).toBe('1 playlist added your song');
    expect(many[0].title).toBe('2 playlists added your song');
  });

  it('never uses an em dash in copy', () => {
    const items = buildAttentionItems({
      yourTasks: { late: [task('a')], today: [task('b')], week: [] },
      waiting: { tasks: [{ id: 'w' } as never] },
      placements: { placed: [{ id: 'p' } as never], underReview: [] },
    });
    for (const item of items) {
      expect(`${item.title} ${item.detail} ${item.action}`).not.toMatch(/\u2014/);
    }
  });
});
