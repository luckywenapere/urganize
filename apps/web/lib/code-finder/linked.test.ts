import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchLinkedDeezer } from './sources';

// The artist's own Deezer page: their albums, then one album's codes and its track's ISRC.
const responses: Record<string, unknown> = {
  '/artist/77/albums': {
    data: [
      { id: 501, title: 'Ohema', record_type: 'single', release_date: '2026-11-06', link: 'https://www.deezer.com/album/501' },
      { id: 400, title: 'Earlier Song', record_type: 'single', release_date: '2025-02-01' },
    ],
  },
  '/album/501': { id: 501, upc: '0123456789012', tracks: { data: [{ id: 9001 }] } },
  '/track/9001': { id: 9001, isrc: 'NGABC2600001' },
};

afterEach(() => vi.unstubAllGlobals());

describe('searchLinkedDeezer', () => {
  it('reads the song and its codes from the linked artist page only', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      seen.push(url.pathname);
      const body = responses[url.pathname];
      return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 404 });
    });
    const found = await searchLinkedDeezer(
      { title: 'Ohema', artistName: 'Dorian', releaseDate: '2026-11-06', releaseType: 'single' },
      '77'
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: '501', upc: '0123456789012', isrc: 'NGABC2600001', artist: 'Dorian' });
    expect(seen.some((path) => path.startsWith('/search'))).toBe(false);
    expect(seen).not.toContain('/album/400');
  });
});
