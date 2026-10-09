/**
 * Read every row of a list query, one page at a time (2026-10-09, v1.92.9).
 *
 * The task lists used a single `.limit(1000)` and only logged when it was hit.
 * A team with 16 rollouts of about 64 activities each holds roughly 1,024, so
 * the last 24 (the ones with the latest dates, because the list is ordered by
 * date) silently dropped out. Everything that counts activities per rollout
 * (the Catalogue's progress, "released when every activity is done", Home, the
 * assistant's snapshot) then read a smaller number than the truth.
 *
 * Pure: the caller hands in the one-page query, so the rules can be tested
 * without a database. A second page is only requested when the first came back
 * full, so a team under the page size pays nothing extra.
 */

/** Matches Supabase's own `max_rows`, so one page is exactly one response. */
export const ROWS_PAGE_SIZE = 1_000;

/** Pages read before giving up. 5 pages is 5,000 rows, well past any team here. */
export const ROWS_MAX_PAGES = 5;

export type PageResult<T> = { data: T[] | null; error: { message?: string } | null };

/** Fetches rows `from` to `to`, both included, like Supabase's `.range()`. */
export type FetchPage<T> = (from: number, to: number) => PromiseLike<PageResult<T>>;

export type PagedRows<T> = {
  rows: T[];
  /** True only when the last allowed page was still full, so more may exist. */
  truncated: boolean;
};

export async function readAllPages<T>(
  fetchPage: FetchPage<T>,
  options: { pageSize?: number; maxPages?: number } = {}
): Promise<PagedRows<T>> {
  const pageSize = Math.max(1, options.pageSize ?? ROWS_PAGE_SIZE);
  const maxPages = Math.max(1, options.maxPages ?? ROWS_MAX_PAGES);
  const rows: T[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, truncated: false };
  }

  return { rows, truncated: true };
}

/** Splits `items` into runs of at most `size`, keeping order. */
export function inChunks<T>(items: readonly T[], size: number): T[][] {
  const step = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += step) {
    chunks.push(items.slice(start, start + step));
  }
  return chunks;
}
