/* eslint-disable @typescript-eslint/no-explicit-any -- The in-memory database stands in for Supabase rows, whose shape is whatever each test needs. */
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * An in-memory stand-in for the Supabase client, covering the query shapes the
 * server modules use: select, the common filters (eq, neq, not, in, gt, gte, lt, lte,
 * is, including a json path like `metadata->>releaseId`), order (several), limit,
 * range, single and maybeSingle, plus insert, update, delete, upsert and rpc.
 * Test code only.
 *
 * It is deliberately small. It does not enforce constraints, joins, row level
 * security or the database's own functions: a test that needs to know a
 * constraint or a policy holds runs the migration on a real Postgres engine
 * (PGlite) instead, and an `rpc` here is whatever the test says it answers.
 *
 * A table named in `failSelectOn` answers every read with an error, the one in
 * `failInsertOn` refuses every insert, and any in `failWriteOn` refuses every
 * insert, update, delete and upsert, so a test can prove what happens when the
 * database misbehaves.
 */
export type FakeRow = Record<string, any>;
export type FakeDb = Record<string, FakeRow[]>;

export type FakeError = { message: string; code?: string };

export type FakeOptions = {
  failSelectOn?: string[];
  failInsertOn?: string;
  failWriteOn?: string[];
  /** What each rpc answers. A name with no handler answers "function does not exist". */
  rpc?: Record<string, (args: any) => { data: unknown; error: FakeError | null } | unknown>;
};

export type FakeWrite = { op: 'insert' | 'update' | 'delete' | 'upsert'; table: string; row?: FakeRow; rows?: FakeRow[]; patch?: FakeRow };

function pathValue(row: FakeRow, column: string): unknown {
  if (!column.includes('->')) return row[column];
  let value: any = row;
  for (const part of column.split(/->>|->/)) value = value == null ? undefined : value[part];
  return value;
}

/** Numbers compare as numbers and everything else as text (ISO dates sort as text). */
function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

export function makeFakeSupabase(db: FakeDb, options: FakeOptions = {}) {
  const inserts: Array<{ table: string; row: FakeRow }> = [];
  const writes: FakeWrite[] = [];
  const rpcCalls: Array<{ name: string; args: any }> = [];
  let nextId = 1;
  const newId = () => `new-${nextId++}`;

  const client = {
    rpc(name: string, args: any) {
      rpcCalls.push({ name, args });
      const handler = options.rpc?.[name];
      if (!handler) {
        return Promise.resolve({ data: null, error: { message: `function ${name} does not exist`, code: '42883' } });
      }
      const result = handler(args) as any;
      const shaped =
        result && typeof result === 'object' && ('data' in result || 'error' in result)
          ? { data: result.data ?? null, error: result.error ?? null }
          : { data: result, error: null };
      return Promise.resolve(shaped);
    },

    from(table: string) {
      const filters: Array<(row: FakeRow) => boolean> = [];
      let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
      let payload: FakeRow | FakeRow[] = {};
      let upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};
      let sorts: Array<{ column: string; ascending: boolean }> = [];
      let max = Infinity;
      let offset = 0;
      let returning = false;
      let want: 'many' | 'single' | 'maybe' = 'many';

      const run = (): { data: any; error: FakeError | null } => {
        const rows = db[table] ?? (db[table] = []);

        if (op === 'insert' || op === 'update' || op === 'delete' || op === 'upsert') {
          if (op === 'insert' && options.failInsertOn === table) {
            return { data: null, error: { message: 'insert refused' } };
          }
          if (options.failWriteOn?.includes(table)) return { data: null, error: { message: 'write refused' } };
        }

        if (op === 'insert') {
          const incoming = Array.isArray(payload) ? payload : [payload];
          const made = incoming.map((row) => ({ id: newId(), created_at: '2026-10-09T10:00:00Z', ...row }));
          for (const row of made) {
            rows.push(row);
            inserts.push({ table, row });
            writes.push({ op: 'insert', table, row });
          }
          return { data: made, error: null };
        }

        if (op === 'upsert') {
          const incoming = Array.isArray(payload) ? payload : [payload];
          const columns = (upsertOptions.onConflict ?? 'id').split(',').map((c) => c.trim());
          const touched: FakeRow[] = [];
          for (const row of incoming) {
            const existing = rows.find((candidate) =>
              columns.every((column) => row[column] !== undefined && row[column] !== null && candidate[column] === row[column])
            );
            if (existing) {
              if (!upsertOptions.ignoreDuplicates) {
                Object.assign(existing, row);
                touched.push(existing);
              }
            } else {
              const made = { id: newId(), created_at: '2026-10-09T10:00:00Z', ...row };
              rows.push(made);
              inserts.push({ table, row: made });
              touched.push(made);
            }
            writes.push({ op: 'upsert', table, row });
          }
          return { data: returning ? touched : null, error: null };
        }

        const matched = rows.filter((row) => filters.every((f) => f(row)));

        if (op === 'update') {
          for (const row of matched) Object.assign(row, payload);
          writes.push({ op: 'update', table, patch: payload as FakeRow });
          return { data: returning ? matched : null, error: null };
        }

        if (op === 'delete') {
          for (const row of matched) rows.splice(rows.indexOf(row), 1);
          writes.push({ op: 'delete', table, rows: matched });
          return { data: returning ? matched : null, error: null };
        }

        if (options.failSelectOn?.includes(table)) return { data: null, error: { message: 'read failed' } };
        let result = matched;
        if (sorts.length > 0) {
          result = [...matched].sort((a, b) => {
            for (const { column, ascending } of sorts) {
              const order = compare(pathValue(a, column), pathValue(b, column));
              if (order !== 0) return ascending ? order : -order;
            }
            return 0;
          });
        }
        return { data: result.slice(offset, offset + max), error: null };
      };

      const finish = () => {
        const result = run();
        if (result.error || want === 'many') return result;
        const list = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
        if (want === 'maybe') return { data: list[0] ?? null, error: null };
        return list.length === 1
          ? { data: list[0], error: null }
          : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
      };

      const filter = (test: (row: FakeRow) => boolean) => {
        filters.push(test);
        return chain;
      };

      const chain: Record<string, any> = {
        select: () => {
          returning = true;
          return chain;
        },
        insert: (row: FakeRow | FakeRow[]) => {
          op = 'insert';
          payload = row;
          return chain;
        },
        update: (patch: FakeRow) => {
          op = 'update';
          payload = patch;
          return chain;
        },
        delete: () => {
          op = 'delete';
          return chain;
        },
        upsert: (rowsToWrite: FakeRow | FakeRow[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) => {
          op = 'upsert';
          payload = rowsToWrite;
          upsertOptions = opts;
          return chain;
        },
        eq: (column: string, value: unknown) => filter((row) => pathValue(row, column) === value),
        neq: (column: string, value: unknown) => filter((row) => pathValue(row, column) !== value),
        not: (column: string, operator: string, value: unknown) =>
          filter((row) => {
            const actual = pathValue(row, column);
            if (operator === 'is') return value === null ? actual != null : actual !== value;
            if (operator === 'eq') return actual !== value;
            throw new Error(`The fake database does not support .not(..., '${operator}', ...) yet.`);
          }),
        in: (column: string, values: unknown[]) => filter((row) => values.includes(pathValue(row, column))),
        gt: (column: string, value: unknown) => filter((row) => compare(pathValue(row, column), value) > 0),
        gte: (column: string, value: unknown) => filter((row) => compare(pathValue(row, column), value) >= 0),
        lt: (column: string, value: unknown) => filter((row) => compare(pathValue(row, column), value) < 0),
        lte: (column: string, value: unknown) => filter((row) => compare(pathValue(row, column), value) <= 0),
        is: (column: string, value: unknown) => filter((row) => (value === null ? pathValue(row, column) == null : pathValue(row, column) === value)),
        order: (column: string, opts?: { ascending?: boolean }) => {
          sorts = [...sorts, { column, ascending: opts?.ascending !== false }];
          return chain;
        },
        limit: (count: number) => {
          max = count;
          return chain;
        },
        range: (from: number, to: number) => {
          offset = from;
          max = to - from + 1;
          return chain;
        },
        single: () => {
          want = 'single';
          return Promise.resolve(finish());
        },
        maybeSingle: () => {
          want = 'maybe';
          return Promise.resolve(finish());
        },
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(finish()).then(resolve, reject),
      };
      return chain;
    },
  } as unknown as SupabaseClient;

  return { client, inserts, writes, rpcCalls };
}
