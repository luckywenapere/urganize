import { describe, expect, it } from 'vitest';
import { EMPTY_LIBRARY, orderBySaved, parseLibrary, serializeLibrary, toggleSaved } from './library';
import { MUSIC_SAVED_LIMIT } from './rules';

describe('parseLibrary', () => {
  it('is empty for nothing, nonsense or the wrong shape', () => {
    for (const raw of [null, undefined, '', 'not json', '42', 'null', '[]', '{}']) {
      expect(parseLibrary(raw as string | null)).toEqual(EMPTY_LIBRARY);
    }
  });

  it('keeps good ids and drops duplicates, blanks and non-strings', () => {
    expect(parseLibrary(JSON.stringify({ saved: ['a', 'a', ' ', 7, 'b'] }))).toEqual({ saved: ['a', 'b'] });
  });

  it('reads an older value that also carried followed artists, keeping the likes', () => {
    expect(parseLibrary(JSON.stringify({ saved: ['a'], following: ['Ola'] }))).toEqual({ saved: ['a'] });
  });

  it('round trips', () => {
    const library = { saved: ['x', 'y'] };
    expect(parseLibrary(serializeLibrary(library))).toEqual(library);
  });

  it('cuts an oversized stored list to the limit', () => {
    const saved = Array.from({ length: MUSIC_SAVED_LIMIT + 20 }, (_, i) => `s${i}`);
    expect(parseLibrary(JSON.stringify({ saved })).saved).toHaveLength(MUSIC_SAVED_LIMIT);
  });
});

describe('toggleSaved', () => {
  it('likes at the top and removes on a second tap', () => {
    const twice = toggleSaved(toggleSaved(EMPTY_LIBRARY, 'a'), 'b');
    expect(twice.saved).toEqual(['b', 'a']);
    expect(toggleSaved(twice, 'a').saved).toEqual(['b']);
  });

  it('drops the oldest like when full', () => {
    let library = EMPTY_LIBRARY;
    for (let i = 0; i < MUSIC_SAVED_LIMIT + 1; i += 1) library = toggleSaved(library, `s${i}`);
    expect(library.saved).toHaveLength(MUSIC_SAVED_LIMIT);
    expect(library.saved).not.toContain('s0');
    expect(library.saved[0]).toBe(`s${MUSIC_SAVED_LIMIT}`);
  });
});

describe('orderBySaved', () => {
  it('orders by when songs were liked and leaves out gone ones', () => {
    const tracks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(orderBySaved({ saved: ['c', 'gone', 'a'] }, tracks).map((t) => t.id)).toEqual(['c', 'a']);
  });
});
