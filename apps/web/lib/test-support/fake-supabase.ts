/* eslint-disable @typescript-eslint/no-explicit-any -- The in-memory database stands in for Supabase rows, whose shape is whatever each test needs. */
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * An in-memory stand-in for the Supabase client, covering the few query shapes
 * the distribution server uses: select, eq (including a json path like
 * `metadata->>releaseId`), order, limit, maybeSingle and insert. Test code only.
 *
 * A table named in `failSelectOn` answers every read with an error, and the one
 * named in `failInsertOn` refuses every insert, so a test can prove what happens
 * when the database misbehaves.
 */
export type FakeRow = Record<string, any>;
export type FakeDb = Record<string, FakeRow[]>;

function pathValue(row: FakeRow, column: string): unknown {
  if (!column.includes('->')) return row[column];
  let value: any = row;
  for (const part of column.split(/->>|->/)) value = value == null ? undefined : value[part];
  return value;
}

/** A stand-in for the few query shapes the distribution server uses. */
export function makeFakeSupabase(db: FakeDb, options: { failSelectOn?: string[]; failInsertOn?: string } = {}) {
  const inserts: Array<{ table: string; row: FakeRow }> = [];
  const client = {
    from(table: string) {
      const filters: Array<(row: FakeRow) => boolean> = [];
      let op: 'select' | 'insert' = 'select';
      let insertRow: FakeRow = {};
      let sort: { column: string; ascending: boolean } | null = null;
      let max = Infinity;

      const run = () => {
        const rows = db[table] ?? (db[table] = []);
        if (op === 'insert') {
          if (options.failInsertOn === table) return { data: null, error: { message: 'insert refused' } };
          const row = { id: `new-${inserts.length + 1}`, created_at: '2026-10-09T10:00:00Z', ...insertRow };
          rows.push(row);
          inserts.push({ table, row });
          return { data: [row], error: null };
        }
        if (options.failSelectOn?.includes(table)) return { data: null, error: { message: 'read failed' } };
        let matched = rows.filter((row) => filters.every((f) => f(row)));
        if (sort) {
          const { column, ascending } = sort;
          matched = [...matched].sort((a, b) => {
            const left = String(a[column] ?? '');
            const right = String(b[column] ?? '');
            return ascending ? left.localeCompare(right) : right.localeCompare(left);
          });
        }
        return { data: matched.slice(0, max), error: null };
      };

      const chain: Record<string, any> = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters.push((row) => pathValue(row, column) === value);
          return chain;
        },
        order: (column: string, opts?: { ascending?: boolean }) => {
          sort = { column, ascending: opts?.ascending !== false };
          return chain;
        },
        limit: (count: number) => {
          max = count;
          return chain;
        },
        insert: (row: FakeRow) => {
          op = 'insert';
          insertRow = row;
          return chain;
        },
        maybeSingle: () => {
          const result = run();
          const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
          return Promise.resolve({ data, error: result.error });
        },
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(run()).then(resolve, reject),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, inserts };
}

