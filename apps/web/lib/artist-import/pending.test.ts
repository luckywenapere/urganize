import { describe, expect, it } from 'vitest';
import { MAX_PENDING_IMPORTS, addPendingImport, parsePendingImports, type PendingArtistImport } from './pending';

const tolu: PendingArtistImport = { provider: 'deezer', id: '123', name: 'Tolu Adeyemi', count: 8 };

describe('parsePendingImports', () => {
  it('reads a saved list', () => {
    expect(parsePendingImports(JSON.stringify([tolu]))).toEqual([tolu]);
  });

  it('returns an empty list for empty, broken or wrong-shaped storage', () => {
    expect(parsePendingImports(null)).toEqual([]);
    expect(parsePendingImports('{nope')).toEqual([]);
    expect(parsePendingImports('{"a":1}')).toEqual([]);
  });

  it('drops rows with an unknown provider, an unsafe id or no name', () => {
    const raw = JSON.stringify([
      { ...tolu, provider: 'spotify' },
      { ...tolu, id: '1/../2' },
      { ...tolu, name: '  ' },
      tolu,
    ]);
    expect(parsePendingImports(raw)).toEqual([tolu]);
  });

  it('turns a bad count into zero', () => {
    expect(parsePendingImports(JSON.stringify([{ ...tolu, count: 'many' }]))[0].count).toBe(0);
  });
});

describe('addPendingImport', () => {
  it('replaces the same artist instead of listing them twice', () => {
    const out = addPendingImport([tolu], { ...tolu, count: 12 });
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(12);
  });

  it('keeps different artists and caps the list, newest kept', () => {
    let list: PendingArtistImport[] = [];
    for (let i = 1; i <= MAX_PENDING_IMPORTS + 3; i++) {
      list = addPendingImport(list, { provider: 'deezer', id: String(i), name: `Artist ${i}`, count: 1 });
    }
    expect(list).toHaveLength(MAX_PENDING_IMPORTS);
    expect(list[list.length - 1].id).toBe(String(MAX_PENDING_IMPORTS + 3));
  });
});
