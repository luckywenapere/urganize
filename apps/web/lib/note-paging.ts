/**
 * Keyset paging for the notebook.
 *
 * Until 2026-09-08 the notes list was capped at 200 with no paging and no
 * indication — the 201st note was invisible, and because search filters a
 * list already fetched, it was also unfindable. That silence was the bug;
 * the cap itself is fine.
 *
 * ── WHY KEYSET AND NOT OFFSET ──────────────────────────────────────────────
 * The list is ordered by `updated_at` descending, and `updated_at` changes
 * every time somebody types. With offset paging, editing any note while a
 * second page is loading shifts every row after it, so the reader sees a note
 * twice or misses one entirely. A keyset cursor names a POSITION rather than
 * a count, so an edit moves that note to the top and the rest of the page is
 * unaffected.
 *
 * ── WHY PINNED NOTES ARE NOT PAGED ─────────────────────────────────────────
 * Sorting is (pinned desc, updated_at desc, id desc), and a cursor over a
 * compound key with a boolean in front is both awkward to express in
 * PostgREST and easy to get subtly wrong. It is also unnecessary: pinning
 * exists to keep a handful of notes at the top, and a user who pins two
 * hundred of them has already defeated it. So the route returns ALL pinned
 * notes on the first page and pages only the unpinned ones. The two sets are
 * disjoint, so this cannot duplicate a row — a note is pinned or it is not.
 *
 * ── WHY `id` IS IN THE SORT KEY ────────────────────────────────────────────
 * Two notes can share an `updated_at` (a bulk write, or simply a coarse
 * clock). Without a unique tiebreak the database is free to order them
 * differently between two queries, which for a keyset cursor means a row can
 * be skipped or repeated at a page boundary. `id` is the tiebreak, and it
 * also fixes the sort instability that existed before paging.
 */

/** One page. Kept at the old NOTES_LIST_LIMIT so the first page is exactly
 *  what shipped before paging existed: only the 201st note onward is new. */
export const NOTES_PAGE_SIZE = 200;

export type NoteCursor = {
  /** `updated_at` of the last row handed out. */
  updatedAt: string;
  /** Its id — the unique tiebreak, see the header. */
  id: string;
};

const SEPARATOR = '|';

/**
 * The two halves are interpolated into a PostgREST `.or()` filter, whose
 * grammar is delimited by commas, parentheses and dots. Neither a timestamp
 * nor a uuid can contain one — so rather than escaping, we REFUSE anything
 * that is not shaped like the value we wrote, and fall back to the first
 * page. A caller cannot reach the filter with a crafted cursor.
 *
 * The reader is already scoped to their own notes by a separate `.eq()` on
 * owner_user_id, so the blast radius was never another user's data. This is
 * about not building a filter out of a string somebody else controls.
 */
const TIMESTAMP_SHAPE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?([+-][0-9]{2}:?[0-9]{2}|Z)?$/;
const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Opaque, url-safe. Opaque because the client has no business constructing
 * one: it names an internal sort position, and a hand-built cursor would let
 * a caller page from somewhere the ordering never puts a row.
 */
export function encodeNoteCursor(cursor: NoteCursor): string {
  return Buffer.from(`${cursor.updatedAt}${SEPARATOR}${cursor.id}`, 'utf8').toString('base64url');
}

/**
 * Tolerant by design. A cursor arrives from a query string, so every junk
 * shape resolves to null and the caller starts from the top — always a safe
 * answer, and better than a 400 for something no legitimate client can send.
 */
export function decodeNoteCursor(raw: string | null | undefined): NoteCursor | null {
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const parts = decoded.split(SEPARATOR);
  if (parts.length !== 2) return null;
  const [updatedAt, id] = parts;
  if (!updatedAt.trim() || !id.trim()) return null;
  if (!TIMESTAMP_SHAPE.test(updatedAt) || !UUID_SHAPE.test(id)) return null;
  return { updatedAt, id };
}

/**
 * Decide a page from a fetch of `pageSize + 1` rows.
 *
 * Asking the database for one more row than we intend to show is what lets
 * "is there another page?" be answered without a second COUNT query — and a
 * count over a mutable table would be a different question anyway, answered
 * a moment later than the page it describes.
 *
 * The probe row is dropped rather than handed out: it belongs to the next
 * page, and returning it would show one row twice.
 */
export function takeNotePage<T>(rows: T[], pageSize: number): { page: T[]; hasMore: boolean } {
  const hasMore = rows.length > pageSize;
  return { page: hasMore ? rows.slice(0, pageSize) : rows, hasMore };
}
