import { describe, expect, it } from 'vitest';
import { searchDeezer } from './sources';
import { decideMatch } from './rules';

// Deezer's real shapes, cut down: a track search, then the track (ISRC) and
// its album (UPC).
const responses: Record<string, unknown> = {
  '/search/track': {
    data: [
      { id: 111, title: 'Ohema', artist: { name: 'Dorian' } },
      { id: 222, title: 'Ohema (Sped Up)', artist: { name: 'Fan Edits' } },
    ],
  },
  '/track/111': {
    id: 111,
    title: 'Ohema',
    isrc: 'NG-ABC-26-00001',
    release_date: '2026-11-06',
    link: 'https://www.deezer.com/track/111',
    artist: { name: 'Dorian' },
    album: { id: 9, cover_xl: 'https://cdn/cover.jpg' },
  },
  '/album/9': { id: 9, upc: '0123456789012', release_date: '2026-11-06' },
};

function fakeFetch(seen: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    seen.push(url.pathname);
    const body = responses[url.pathname];
    return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 404 });
  }) as typeof fetch;
}

const target = { title: 'Ohema', artistName: 'Dorian', releaseDate: '2026-11-06', releaseType: 'single' };

describe('searchDeezer', () => {
  it('reads the ISRC off the track and the UPC off its album', async () => {
    const seen: string[] = [];
    const found = await searchDeezer(target, fakeFetch(seen));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      source: 'deezer',
      id: '111',
      kind: 'track',
      isrc: 'NGABC2600001',
      upc: '0123456789012',
      releaseDate: '2026-11-06',
      coverUrl: 'https://cdn/cover.jpg',
    });
    // The sped-up upload by someone else never gets its details fetched.
    expect(seen).not.toContain('/track/222');
  });

  it('feeds a match the rules accept', async () => {
    const found = await searchDeezer(target, fakeFetch([]));
    expect(decideMatch(target, found).kind).toBe('clear');
  });

  it('finds nothing, without throwing, when Deezer is down', async () => {
    const down = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(searchDeezer(target, down)).resolves.toEqual([]);
  });
});
