import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LINKS_PER_DAY,
  decideLinkCap,
  lagosDayStartIso,
  parseTypedCode,
  readDeezerAlbumCodes,
  readDeezerTrackIsrc,
  readLinksPerDay,
} from './codes';

describe('readLinksPerDay', () => {
  it('reads {"limit": N} and a bare number', () => {
    expect(readLinksPerDay({ limit: 25 })).toBe(25);
    expect(readLinksPerDay(40)).toBe(40);
    expect(readLinksPerDay({ limit: 0 })).toBe(0);
  });

  it('falls back to 10 for anything unusable', () => {
    for (const bad of [null, undefined, 'ten', { limit: -1 }, { limit: 1.5 }, { limit: 5000 }, {}]) {
      expect(readLinksPerDay(bad)).toBe(DEFAULT_LINKS_PER_DAY);
    }
    expect(DEFAULT_LINKS_PER_DAY).toBe(10);
  });
});

describe('lagosDayStartIso', () => {
  it('starts the day at 23:00 UTC the evening before (Lagos is UTC+1)', () => {
    expect(lagosDayStartIso(Date.parse('2026-10-26T10:00:00Z'))).toBe('2026-10-25T23:00:00.000Z');
  });

  it('rolls over at Lagos midnight, not UTC midnight', () => {
    expect(lagosDayStartIso(Date.parse('2026-10-26T22:59:59Z'))).toBe('2026-10-25T23:00:00.000Z');
    expect(lagosDayStartIso(Date.parse('2026-10-26T23:00:00Z'))).toBe('2026-10-26T23:00:00.000Z');
  });
});

describe('decideLinkCap', () => {
  it('allows until the limit is used', () => {
    expect(decideLinkCap({ used: 9, limit: 10 })).toEqual({ allowed: true, limit: 10, used: 9, remaining: 1 });
    expect(decideLinkCap({ used: 10, limit: 10 })).toEqual({ allowed: false, limit: 10, used: 10, remaining: 0 });
  });

  it('never goes negative, and a limit of zero allows nothing', () => {
    expect(decideLinkCap({ used: 14, limit: 10 }).remaining).toBe(0);
    expect(decideLinkCap({ used: 0, limit: 0 }).allowed).toBe(false);
  });
});

describe('parseTypedCode', () => {
  it('reads a UPC with spaces or dashes', () => {
    expect(parseTypedCode('1968 7452-8037')).toEqual({ upc: '196874528037', isrc: null });
  });

  it('reads an ISRC with dashes, in any case', () => {
    expect(parseTypedCode('us-qx9-26-02558')).toEqual({ upc: null, isrc: 'USQX92602558' });
  });

  it('refuses anything else', () => {
    expect(parseTypedCode('12345')).toBeNull();
    expect(parseTypedCode('hello')).toBeNull();
    expect(parseTypedCode(42)).toBeNull();
  });
});

describe('deezer code readers', () => {
  it('reads the UPC and the first track id from an album body', () => {
    expect(readDeezerAlbumCodes({ upc: '196874528037', tracks: { data: [{ id: 4208268122 }, { id: 2 }] } })).toEqual({
      upc: '196874528037',
      firstTrackId: '4208268122',
    });
  });

  it('tolerates a missing UPC, no tracks and junk', () => {
    expect(readDeezerAlbumCodes({ upc: '0', tracks: { data: [] } })).toEqual({ upc: null, firstTrackId: null });
    expect(readDeezerAlbumCodes(null)).toEqual({ upc: null, firstTrackId: null });
  });

  it('reads an ISRC from a track body', () => {
    expect(readDeezerTrackIsrc({ isrc: 'USQX92602558' })).toBe('USQX92602558');
    expect(readDeezerTrackIsrc({ isrc: 'nope' })).toBeNull();
  });
});
