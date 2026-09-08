import { describe, expect, it } from 'vitest';
import {
  NOTES_PAGE_SIZE,
  decodeNoteCursor,
  encodeNoteCursor,
  takeNotePage,
} from './note-paging';

const CURSOR = { updatedAt: '2026-09-08T12:00:00.000Z', id: 'a1b2c3d4-0000-4000-8000-000000000001' };

describe('encodeNoteCursor / decodeNoteCursor', () => {
  it('round trips', () => {
    expect(decodeNoteCursor(encodeNoteCursor(CURSOR))).toEqual(CURSOR);
  });

  /** It travels in a query string, so it must survive one without escaping. */
  it('is url safe — no +, / or = in the encoded form', () => {
    const encoded = encodeNoteCursor(CURSOR);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });

  /** A cursor arrives from a query string, so every junk shape a caller can
   *  put there has to resolve to "no cursor" rather than throwing — the page
   *  then simply starts from the top, which is always a safe answer. */
  it.each([
    ['null', null],
    ['empty', ''],
    ['not base64', '!!!!'],
    ['base64 of nonsense', Buffer.from('nonsense').toString('base64url')],
    ['missing the id half', Buffer.from('2026-09-08T12:00:00.000Z').toString('base64url')],
    ['missing the timestamp half', Buffer.from('|abc').toString('base64url')],
    ['too many parts', Buffer.from('a|b|c').toString('base64url')],
    ['blank timestamp', Buffer.from(' |abc').toString('base64url')],
    // Shape refusals. These are the ones that matter: both halves are
    // interpolated into a PostgREST .or() filter, whose grammar is delimited
    // by commas, parens and dots.
    ['a timestamp carrying a filter delimiter', Buffer.from(`2026-09-08T12:00:00.000Z,id.gt.0|${'a'.repeat(8)}-0000-4000-8000-000000000001`).toString('base64url')],
    ['an id that is not a uuid', Buffer.from('2026-09-08T12:00:00.000Z|not-a-uuid').toString('base64url')],
    ['an id carrying a paren', Buffer.from('2026-09-08T12:00:00.000Z|a1b2c3d4-0000-4000-8000-00000000000)').toString('base64url')],
    ['a timestamp that is prose', Buffer.from('yesterday|a1b2c3d4-0000-4000-8000-000000000001').toString('base64url')],
  ])('returns null for %s', (_label, raw) => {
    expect(decodeNoteCursor(raw)).toBeNull();
  });
});

describe('takeNotePage', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));

  /** The route asks for pageSize + 1 and this decides. Asking for one extra
   *  is what lets "is there more?" be answered without a second count query. */
  it('reports no more when the fetch came back short', () => {
    const { page, hasMore } = takeNotePage(rows(5), 10);
    expect(page).toHaveLength(5);
    expect(hasMore).toBe(false);
  });

  it('reports no more when the fetch came back exactly full', () => {
    const { page, hasMore } = takeNotePage(rows(10), 10);
    expect(page).toHaveLength(10);
    expect(hasMore).toBe(false);
  });

  /** The whole point of the +1: a single extra row means another page exists,
   *  and that row must NOT be handed out — it belongs to the next page. */
  it('drops the probe row and reports more when one extra came back', () => {
    const { page, hasMore } = takeNotePage(rows(11), 10);
    expect(page).toHaveLength(10);
    expect(hasMore).toBe(true);
    expect(page.map((r) => r.id)).not.toContain('10');
  });

  it('handles an empty result', () => {
    expect(takeNotePage([], 10)).toEqual({ page: [], hasMore: false });
  });

  it('never returns more than the page size even if handed far too many', () => {
    const { page, hasMore } = takeNotePage(rows(50), 10);
    expect(page).toHaveLength(10);
    expect(hasMore).toBe(true);
  });
});

describe('NOTES_PAGE_SIZE', () => {
  /** Kept at the old NOTES_LIST_LIMIT so the first page is byte-identical to
   *  what shipped before paging existed — nobody's notebook reorders on
   *  deploy, and only the 201st note onward is new behaviour. */
  it('matches the limit the feature shipped with', () => {
    expect(NOTES_PAGE_SIZE).toBe(200);
  });
});
