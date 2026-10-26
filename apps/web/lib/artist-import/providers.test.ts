import { describe, expect, it } from 'vitest';
import {
  cleanItunesTitle,
  dedupeReleases,
  describeCadence,
  isSafeSourceId,
  normalizeImportDate,
  parseDeezerAlbums,
  parseDeezerArtists,
  parseItunesAlbums,
  parseItunesArtists,
  type ImportRelease,
} from './providers';

function release(over: Partial<ImportRelease> & { title: string }): ImportRelease {
  return {
    provider: 'deezer',
    sourceId: String(Math.floor(Math.random() * 1e9)),
    kind: 'single',
    releaseDate: '2025-01-01',
    coverUrl: null,
    url: null,
    ...over,
  };
}

describe('deezer parsing', () => {
  it('reads artists with a photo and fan count', () => {
    const out = parseDeezerArtists({
      data: [
        { id: 123, name: 'Tolu Adeyemi', picture_medium: 'https://cdn.example/p.jpg', nb_fan: 41200 },
        { id: 'not-a-number', name: 'Bad' },
        { id: 5, name: '' },
      ],
    });
    expect(out).toEqual([
      {
        provider: 'deezer',
        id: '123',
        name: 'Tolu Adeyemi',
        imageUrl: 'https://cdn.example/p.jpg',
        followers: 41200,
        genre: null,
      },
    ]);
  });

  it('returns nothing for a body it does not understand', () => {
    expect(parseDeezerArtists(null)).toEqual([]);
    expect(parseDeezerArtists({ error: { code: 4 } })).toEqual([]);
    expect(parseDeezerAlbums('nope')).toEqual([]);
  });

  it('maps record_type to a kind and keeps the date and cover', () => {
    const out = parseDeezerAlbums({
      data: [
        { id: 1, title: 'Lagos Rain', record_type: 'single', release_date: '2026-03-07', cover_medium: 'https://c/1.jpg' },
        { id: 2, title: 'Slow Burn', record_type: 'ep', release_date: '2025-05-01' },
        { id: 3, title: 'Night Shift', record_type: 'album', release_date: '2024-02-02' },
      ],
    });
    expect(out.map((r) => [r.title, r.kind, r.releaseDate])).toEqual([
      ['Lagos Rain', 'single', '2026-03-07'],
      ['Slow Burn', 'ep', '2025-05-01'],
      ['Night Shift', 'album', '2024-02-02'],
    ]);
    expect(out[0].coverUrl).toBe('https://c/1.jpg');
  });

  it('drops a javascript: url instead of keeping it', () => {
    const out = parseDeezerAlbums({
      data: [{ id: 1, title: 'X', record_type: 'single', cover_medium: 'javascript:alert(1)', link: 'data:text/html,hi' }],
    });
    expect(out[0].coverUrl).toBeNull();
    expect(out[0].url).toBeNull();
  });
});

describe('itunes parsing', () => {
  it('reads artist matches with a genre', () => {
    const out = parseItunesArtists({
      results: [{ artistId: 9, artistName: 'Tolu Adeyemi', primaryGenreName: 'Afrobeats' }],
    });
    expect(out[0]).toMatchObject({ provider: 'itunes', id: '9', name: 'Tolu Adeyemi', genre: 'Afrobeats' });
  });

  it('skips the artist row and reads collections, stripping the type from the title', () => {
    const out = parseItunesAlbums({
      results: [
        { wrapperType: 'artist', artistId: 9 },
        {
          wrapperType: 'collection',
          collectionId: 11,
          collectionName: 'Lagos Rain - Single',
          releaseDate: '2026-03-07T08:00:00Z',
          trackCount: 1,
          artworkUrl100: 'https://is1.example/100x100bb.jpg',
        },
        { wrapperType: 'collection', collectionId: 12, collectionName: 'Slow Burn - EP', trackCount: 5 },
        { wrapperType: 'collection', collectionId: 13, collectionName: 'Night Shift', trackCount: 12 },
      ],
    });
    expect(out.map((r) => [r.title, r.kind])).toEqual([
      ['Lagos Rain', 'single'],
      ['Slow Burn', 'ep'],
      ['Night Shift', 'album'],
    ]);
    expect(out.find((r) => r.title === 'Lagos Rain')?.coverUrl).toBe('https://is1.example/300x300bb.jpg');
  });

  it('cleans a title only at the end', () => {
    expect(cleanItunesTitle('Single - EP')).toBe('Single');
    expect(cleanItunesTitle('Ep - Remix')).toBe('Ep - Remix');
  });
});

describe('dedupeReleases', () => {
  it('keeps the newest copy of the same title and kind and sorts newest first', () => {
    const out = dedupeReleases([
      release({ title: 'Fireflies', releaseDate: '2025-01-01', sourceId: '1' }),
      release({ title: 'fireflies', releaseDate: '2025-06-01', sourceId: '2' }),
      release({ title: 'Okada', releaseDate: '2023-01-01', sourceId: '3' }),
    ]);
    expect(out.map((r) => r.sourceId)).toEqual(['2', '3']);
  });

  it('treats a single and an EP with one name as two releases', () => {
    const out = dedupeReleases([
      release({ title: 'Same', kind: 'single' }),
      release({ title: 'Same', kind: 'ep' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 250 }, (_, i) => release({ title: `Song ${i}` }));
    expect(dedupeReleases(many)).toHaveLength(100);
  });
});

describe('ids and dates', () => {
  it('accepts digits only as a source id', () => {
    expect(isSafeSourceId('123')).toBe(true);
    expect(isSafeSourceId('12/../3')).toBe(false);
    expect(isSafeSourceId('')).toBe(false);
    expect(isSafeSourceId(123)).toBe(false);
  });

  it('reads the date part and refuses nonsense', () => {
    expect(normalizeImportDate('2026-03-07T08:00:00Z')).toBe('2026-03-07');
    expect(normalizeImportDate('0000-00-00')).toBeNull();
    expect(normalizeImportDate('soon')).toBeNull();
    expect(normalizeImportDate(undefined)).toBeNull();
  });
});

describe('describeCadence', () => {
  const now = Date.parse('2026-08-07T00:00:00Z');

  it('says nothing when no release has a date', () => {
    expect(describeCadence([release({ title: 'A', releaseDate: null })], now)).toBeNull();
  });

  it('reports months since the newest release', () => {
    const out = describeCadence([release({ title: 'Lagos Rain', releaseDate: '2026-03-07' })], now);
    expect(out).toEqual({ latestTitle: 'Lagos Rain', monthsSince: 5, usualGapMonths: null });
  });

  it('needs three dated releases for a usual gap, and uses the median', () => {
    const out = describeCadence(
      [
        release({ title: 'C', releaseDate: '2026-03-01' }),
        release({ title: 'B', releaseDate: '2025-09-01' }),
        release({ title: 'A', releaseDate: '2025-03-01' }),
      ],
      now
    );
    expect(out?.usualGapMonths).toBe(6);
  });
});
