import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IN_LIST_CHUNK,
  ROWS_MAX_PAGES,
  ROWS_PAGE_SIZE,
  inChunks,
  readAllPages,
  readInChunks,
  type PageResult,
} from '@/lib/paged-rows';

/**
 * Task lists read every page (2026-10-09, v1.92.9).
 *
 * One `.limit(1000)` cut a team of about sixteen rollouts short, and the
 * activities past it (the latest-dated ones) vanished from every count: the
 * Catalogue's progress, "released when all done", Home and the assistant.
 */

/** A fake table of `total` numbered rows that answers range requests. */
function table(total: number) {
  const calls: Array<[number, number]> = [];
  const fetchPage = async (from: number, to: number): Promise<PageResult<number>> => {
    calls.push([from, to]);
    const data: number[] = [];
    for (let i = from; i <= to && i < total; i += 1) data.push(i);
    return { data, error: null };
  };
  return { fetchPage, calls };
}

describe('readAllPages', () => {
  it('reads a small list in one request', async () => {
    const t = table(64);
    const result = await readAllPages(t.fetchPage);
    expect(result.rows).toHaveLength(64);
    expect(result.truncated).toBe(false);
    expect(t.calls).toEqual([[0, 999]]);
  });

  it('reads an empty list as empty, not truncated', async () => {
    const result = await readAllPages(table(0).fetchPage);
    expect(result).toEqual({ rows: [], truncated: false });
  });

  it('treats a null page as empty', async () => {
    const result = await readAllPages(async () => ({ data: null, error: null }));
    expect(result).toEqual({ rows: [], truncated: false });
  });

  it('asks for a second page when the first is exactly full, and stops when it is empty', async () => {
    const t = table(ROWS_PAGE_SIZE);
    const result = await readAllPages(t.fetchPage);
    expect(result.rows).toHaveLength(ROWS_PAGE_SIZE);
    expect(result.truncated).toBe(false);
    expect(t.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('reads past the old 1,000-row cap without losing the tail', async () => {
    const t = table(1_024);
    const result = await readAllPages(t.fetchPage);
    expect(result.rows).toHaveLength(1_024);
    expect(result.rows[1_023]).toBe(1_023);
    expect(result.truncated).toBe(false);
  });

  it('returns rows in order with no gaps or repeats across pages', async () => {
    const result = await readAllPages(table(2_500).fetchPage);
    expect(result.rows).toEqual(Array.from({ length: 2_500 }, (_, i) => i));
  });

  it('says so when the ceiling is reached with the last page still full', async () => {
    const total = ROWS_PAGE_SIZE * ROWS_MAX_PAGES + 10;
    const t = table(total);
    const result = await readAllPages(t.fetchPage);
    expect(result.rows).toHaveLength(ROWS_PAGE_SIZE * ROWS_MAX_PAGES);
    expect(result.truncated).toBe(true);
    expect(t.calls).toHaveLength(ROWS_MAX_PAGES);
  });

  it('throws a failed page instead of returning a short list that looks complete', async () => {
    let n = 0;
    const fetchPage = async (): Promise<PageResult<number>> => {
      n += 1;
      if (n === 2) return { data: null, error: { message: 'boom' } };
      return { data: Array.from({ length: ROWS_PAGE_SIZE }, (_, i) => i), error: null };
    };
    await expect(readAllPages(fetchPage)).rejects.toMatchObject({ message: 'boom' });
  });

  it('honours a smaller page size and page limit', async () => {
    const t = table(100);
    const result = await readAllPages(t.fetchPage, { pageSize: 10, maxPages: 3 });
    expect(result.rows).toHaveLength(30);
    expect(result.truncated).toBe(true);
    expect(t.calls).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
    ]);
  });
});

describe('inChunks', () => {
  it('splits in order into runs of at most the size', () => {
    expect(inChunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('gives nothing for nothing and one run for a short list', () => {
    expect(inChunks([], 3)).toEqual([]);
    expect(inChunks([1, 2], 10)).toEqual([[1, 2]]);
  });

  it('never loops forever on a bad size', () => {
    expect(inChunks([1, 2, 3], 0)).toEqual([[1], [2], [3]]);
  });
});

/** A fake table keyed by a value: every key owns `perKey` rows, answered a page at a time. */
function keyedTable(perKey: number) {
  const requests: Array<{ group: string[]; from: number; to: number }> = [];
  const fetchPage = async (group: string[], from: number, to: number): Promise<PageResult<string>> => {
    requests.push({ group, from, to });
    const all = group.flatMap((key) => Array.from({ length: perKey }, (_, i) => `${key}#${i}`));
    return { data: all.slice(from, to + 1), error: null };
  };
  return { fetchPage, requests };
}

describe('readInChunks', () => {
  it('reads nothing for no keys', async () => {
    const t = keyedTable(3);
    expect(await readInChunks([], t.fetchPage)).toEqual({ rows: [], truncated: false });
    expect(t.requests).toEqual([]);
  });

  it('never sends more keys than the chunk size in one request', async () => {
    const keys = Array.from({ length: IN_LIST_CHUNK * 2 + 10 }, (_, i) => `k${i}`);
    const t = keyedTable(1);
    const result = await readInChunks(keys, t.fetchPage);
    expect(result.rows).toHaveLength(keys.length);
    expect(Math.max(...t.requests.map((r) => r.group.length))).toBe(IN_LIST_CHUNK);
    expect(t.requests.every((r) => r.group.length <= IN_LIST_CHUNK)).toBe(true);
  });

  it('reads past 1,000 rows within one chunk and keeps every row', async () => {
    const result = await readInChunks(['a', 'b', 'c'], keyedTable(500).fetchPage);
    expect(result.rows).toHaveLength(1_500);
    expect(result.rows[1_499]).toBe('c#499');
    expect(result.truncated).toBe(false);
  });

  it('stops at the ceiling and says so', async () => {
    const result = await readInChunks(['a', 'b'], keyedTable(3_000).fetchPage, { maxRows: 2_501 });
    expect(result.rows).toHaveLength(2_501);
    expect(result.truncated).toBe(true);
  });

  it('counts holding exactly the ceiling as reaching it, and returns no more than the ceiling', async () => {
    const result = await readInChunks(['a'], keyedTable(1_000).fetchPage, { maxRows: 1_000 });
    expect(result.rows).toHaveLength(1_000);
    expect(result.truncated).toBe(true);
  });

  it('does not call a list that ends exactly below the ceiling truncated', async () => {
    const result = await readInChunks(['a'], keyedTable(2_500).fetchPage, { maxRows: 2_501 });
    expect(result.rows).toHaveLength(2_500);
    expect(result.truncated).toBe(false);
  });

  it('throws a failed read instead of returning a short list that looks complete', async () => {
    const fetchPage = async (): Promise<PageResult<string>> => ({ data: null, error: { message: 'no such table' } });
    await expect(readInChunks(['a'], fetchPage)).rejects.toMatchObject({ message: 'no such table' });
  });
});

describe('the account export is complete', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/account/export/route.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const read = route.slice(route.indexOf('async function readSection('), route.indexOf('async function withDownloadUrls('));

  it('reads each section a page at a time, in chunks of ids', () => {
    expect(route).toContain("from '@/lib/paged-rows'");
    expect(read).toContain('readInChunks<');
    expect(read).toContain('.range(from, to)');
    expect(read).toContain('.order(orderBy');
    expect(read).not.toMatch(/\.in\(column, values/);
  });

  it('reads one row past its own cap so a cut is announced, not hidden', () => {
    expect(read).toContain('EXPORT_ROW_CAP + 1');
  });

  it('pages the two tables that have no id column by their own key', () => {
    expect(route).toMatch(/table: 'release_payback',[\s\S]*?orderBy: 'release_id'/);
    expect(route).toMatch(/table: 'user_presence_days',[\s\S]*?orderBy: 'day'/);
  });

  it('still reports a failed read as unavailable rather than failing the whole export', () => {
    expect(read).toMatch(/catch \(error\)[\s\S]*buildSection\(null, message\)/);
  });
});

describe('the task lists use it', () => {
  const service = readFileSync(join(process.cwd(), 'lib/services/task-service.ts'), 'utf8');
  const server = readFileSync(join(process.cwd(), 'lib/tasks-server.ts'), 'utf8');
  const code = service.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('no task list is a single capped page any more', () => {
    expect(code).toContain("from '@/lib/paged-rows'");
    expect(code).not.toMatch(/\.limit\(\s*TASK_LIST_MAX_ROWS\s*\)/);
    expect(code.match(/readAllPages</g)?.length).toBeGreaterThanOrEqual(2);
    expect(code.match(/\.range\(from, to\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('breaks ties on id, so a page boundary never skips or repeats a row', () => {
    expect(code.match(/\.order\('id', \{ ascending: true \}\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('the ceiling is still named and logged when hit', () => {
    expect(service).toContain('ROWS_PAGE_SIZE * ROWS_MAX_PAGES');
    expect(code.match(/console\.warn\(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('counts comments and files in chunks, not one giant request', () => {
    const body = server.slice(server.indexOf('async function loadTaskCounts('), server.indexOf('function toTask('));
    expect(body).toContain('inChunks(');
    expect(body).toContain('Promise.all(');
  });
});

describe('account deletion finds every attachment file', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/account/delete-now/route.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const cleanup = route.slice(route.indexOf('async function removeUserStorageObjects('), route.indexOf('export async function POST('));

  it('reads each list a page at a time instead of stopping at 1,000 rows', () => {
    expect(route).toContain("from '@/lib/paged-rows'");
    expect(cleanup.match(/readRows</g)?.length).toBeGreaterThanOrEqual(5);
    expect(cleanup.match(/\.range\(from, to\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(cleanup.match(/\.order\('id', \{ ascending: true \}\)/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('never sends every task id in one request', () => {
    const lookups = cleanup.slice(cleanup.indexOf('inChunks(taskIds'));
    expect(lookups).toContain(".in('task_id', group)");
    expect(cleanup).not.toContain(".in('task_id', taskIds)");
    expect(cleanup).not.toContain(".in('release_id', releaseIds)");
  });

  it('still carries on when a read fails, so deleting an account is never blocked', () => {
    expect(cleanup).toContain('logQueryError(label');
    expect(cleanup).toMatch(/catch \(error\)[\s\S]*return \[\]/);
  });
});
