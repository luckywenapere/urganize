import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ROWS_MAX_PAGES,
  ROWS_PAGE_SIZE,
  inChunks,
  readAllPages,
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
