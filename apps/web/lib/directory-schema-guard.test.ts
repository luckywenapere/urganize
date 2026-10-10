import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { DIRECTORY_ROLES } from './directory-roles';
import {
  WORK_REQUEST_LINKS_MAX,
  WORK_REQUEST_NEXT_RELEASE_MAX_CHARS,
  WORK_REQUEST_STATUSES,
} from './work-requests';
import { FEATURED_NOTE_MAX_CHARS, SHELF_SIZE } from './directory-featuring';

/**
 * The role vocabulary is written twice: once in TypeScript, once as a CHECK
 * constraint. That duplication is unavoidable — the database has to reject a
 * bad value on its own — but drift between the two is not.
 *
 * A role added only to the TypeScript list would pass every other test here and
 * then fail at the Postgres boundary the first time somebody earned it. This
 * turns that into a build failure instead.
 */

const MIGRATION = join(
  __dirname,
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
  '20260905200000_person_directory.sql'
);

const EXPIRED_MIGRATION = join(
  __dirname,
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
  '20261009130000_work_requests_expired.sql'
);

const FEATURING_MIGRATION = join(
  __dirname,
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
  '20261010100000_directory_featuring.sql'
);

const REQUESTS_MIGRATION = join(
  __dirname,
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
  '20260906120000_work_requests.sql'
);

function checkConstraintValues(sql: string, constraintName: string): string[] {
  const start = sql.indexOf(constraintName);
  if (start < 0) return [];
  const open = sql.indexOf('(', sql.indexOf('check', start));
  let depth = 0;
  let end = open;
  for (let i = open; i < sql.length; i += 1) {
    if (sql[i] === '(') depth += 1;
    if (sql[i] === ')') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  return (sql.slice(open, end).match(/'([a-z_]+)'/g) || []).map((raw) => raw.slice(1, -1));
}

describe('directory schema', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('lists the same roles in SQL as in TypeScript', () => {
    const inSql = checkConstraintValues(sql, 'delivery_records_role_check');
    expect(inSql.length).toBeGreaterThan(0);
    expect([...inSql].sort()).toEqual([...DIRECTORY_ROLES].sort());
  });

  it('gives delivery_records no write policy of any kind', () => {
    // The load-bearing property of the whole feature: a record is computed, so
    // there must be no path from a signed-in client to writing one. A single
    // `for all` or `for insert` policy on this table would undo it.
    const policies = sql.match(/create policy[\s\S]*?on public\.delivery_records for (\w+)/g) || [];
    const kinds = policies.map((line) => line.slice(line.lastIndexOf(' ') + 1));
    expect(kinds).toEqual(['select']);
  });

  it('keeps row level security on for both tables', () => {
    expect(sql).toContain('alter table public.person_profiles enable row level security');
    expect(sql).toContain('alter table public.delivery_records enable row level security');
  });

  it('defaults a new profile to private', () => {
    // Nobody is listed without opting in. A default of 'directory' would list
    // every user the moment the table exists.
    expect(sql).toMatch(/visibility text not null default 'private'/);
  });

  it('scopes a record to exactly one release or show', () => {
    expect(sql).toContain('num_nonnulls(release_id, show_id) = 1');
  });
});

describe('work requests schema', () => {
  const sql = readFileSync(REQUESTS_MIGRATION, 'utf8');

  it('lists the same roles as TypeScript, like the other two tables', () => {
    const inSql = checkConstraintValues(sql, 'work_requests_role_check');
    expect(inSql.length).toBeGreaterThan(0);
    expect([...inSql].sort()).toEqual([...DIRECTORY_ROLES].sort());
  });

  it('gives the table no write policy of any kind', () => {
    // Every write carries an invariant RLS cannot express — the open-request
    // cap, honest denormalised fields, and the rule that only the recipient
    // moves a status. One `for all` or `for insert` policy would undo all of
    // it, the same property delivery_records depends on above.
    const policies = sql.match(/create policy[\s\S]*?on public\.work_requests for (\w+)/g) || [];
    const kinds = policies.map((line) => line.slice(line.lastIndexOf(' ') + 1));
    expect(kinds).toEqual(['select', 'select']);
  });

  it('reads from both sides, which is what makes it cross-tenant', () => {
    expect(sql).toContain('auth.uid() = recipient_user_id');
    expect(sql).toContain('auth.uid() = sender_user_id');
  });

  it('keeps row level security on', () => {
    expect(sql).toContain('alter table public.work_requests enable row level security');
  });

  it('allows only ONE open request per team per person per role', () => {
    // Partial, so a team can ask again once the last one was answered — a no
    // on one single is not a no forever — while nobody can queue five
    // identical asks at somebody.
    expect(sql).toMatch(/unique index[\s\S]*?work_requests_open_key[\s\S]*?where status = 'new'/);
  });

  it('starts a request as new', () => {
    expect(sql).toMatch(/status text not null default 'new'/);
  });
});

describe('work requests closing after seven days', () => {
  const sql = readFileSync(EXPIRED_MIGRATION, 'utf8');

  it('allows exactly the statuses TypeScript lists', () => {
    // A status added only in TypeScript would pass every other test and then
    // fail at the Postgres boundary the first time the sweep wrote it.
    const inSql = checkConstraintValues(sql, 'work_requests_status_check');
    expect(inSql.length).toBeGreaterThan(0);
    expect([...inSql].sort()).toEqual([...WORK_REQUEST_STATUSES].sort());
  });

  it('adds no write policy, so a closed request is still only ever written by the service role', () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  it('leaves the open-request index alone, so an expired request frees the slot', () => {
    // The index is `where status = 'new'` in the original migration. This one
    // must not touch it: the whole point is that `expired` drops out of it.
    expect(sql).not.toContain('work_requests_open_key');
  });
});

describe('the directory featuring migration (spec, step 2)', () => {
  const sql = readFileSync(FEATURING_MIGRATION, 'utf8');
  // The DDL with its comments taken off, so the header's rollback notes (which
  // contain `drop table`) cannot satisfy or fail a check about the statements.
  const code = sql.replace(/^\s*--.*$/gm, '');

  it('lists the same roles as TypeScript on both new tables', () => {
    for (const name of ['directory_featured_role_check', 'directory_rising_role_check']) {
      const inSql = checkConstraintValues(sql, name);
      expect(inSql.length).toBeGreaterThan(0);
      expect([...inSql].sort()).toEqual([...DIRECTORY_ROLES].sort());
    }
  });

  // The load-bearing property: Featured is Urganize's to give and On the rise is
  // computed, so neither can be written by a signed-in person. A single `for all`
  // policy would let anybody feature themselves.
  it('gives neither new table a policy of any kind', () => {
    expect(code).not.toMatch(/create policy/i);
    expect(code).toContain('alter table public.directory_featured enable row level security');
    expect(code).toContain('alter table public.directory_rising enable row level security');
  });

  it('only adds: nothing is dropped, deleted or rewritten', () => {
    expect(code).not.toMatch(/\bdrop\s+(table|column|index|constraint)\b/i);
    expect(code).not.toMatch(/\bdelete\s+from\b/i);
    expect(code).not.toMatch(/\btruncate\b/i);
    expect(code).not.toMatch(/\bupdate\s+public\./i);
    // Every column and table it makes can be made twice.
    expect(code.match(/add column/gi)?.length).toBe(code.match(/add column if not exists/gi)?.length);
    expect(code).not.toMatch(/create table (?!if not exists)/i);
    expect(code).not.toMatch(/create (unique )?index (?!if not exists)/i);
  });

  it('keeps the new request fields in step with the limits in code', () => {
    expect(sql).toMatch(/char_length\(btrim\(next_release\)\) between 1 and (\d+)/);
    const max = Number(/char_length\(btrim\(next_release\)\) between 1 and (\d+)/.exec(sql)?.[1]);
    expect(max).toBe(WORK_REQUEST_NEXT_RELEASE_MAX_CHARS);
    expect(sql).toMatch(/jsonb_array_length\(links\) <= (\d+)/);
    expect(Number(/jsonb_array_length\(links\) <= (\d+)/.exec(sql)?.[1])).toBe(WORK_REQUEST_LINKS_MAX);
    expect(sql).toMatch(/char_length\(note\) <= (\d+)/);
    expect(Number(/char_length\(note\) <= (\d+)/.exec(sql)?.[1])).toBe(FEATURED_NOTE_MAX_CHARS);
  });

  it('holds a shelf to six people, the number the code uses', () => {
    expect(sql).toMatch(/rank between 1 and (\d+)/);
    expect(Number(/rank between 1 and (\d+)/.exec(sql)?.[1])).toBe(SHELF_SIZE);
  });

  it('makes a hire the default of nobody: a person is a seat unless they say otherwise', () => {
    expect(sql).toMatch(/add column if not exists is_hire boolean not null default false/);
  });

  it('keeps the rollout off the recipient: the new request fields are all nullable or defaulted', () => {
    // Existing rows must keep working and a plain ask must still insert.
    expect(sql).toMatch(/add column if not exists next_release text/);
    expect(sql).toMatch(/links jsonb not null default '\[\]'/);
    expect(sql).toMatch(/task_id uuid references public\.tasks\(id\) on delete set null/);
    expect(sql).toMatch(/shared_release_id uuid references public\.releases\(id\) on delete set null/);
    expect(sql).toMatch(/started_at timestamptz/);
  });

  it('never lets a deleted rollout or activity take a request with it', () => {
    // Both are set null, so the request (and the count of work it started)
    // outlives what it pointed at.
    expect(code).not.toMatch(/on delete cascade[^\n]*releases/i);
    expect(code.match(/on delete set null/gi)?.length).toBeGreaterThanOrEqual(3);
  });

  it('makes featuring one person for one role from one day only once', () => {
    expect(sql).toMatch(/unique index if not exists directory_featured_pick_key[\s\S]*?\(user_id, role, starts_on\)/);
    expect(sql).toMatch(/unique index if not exists directory_rising_month_key[\s\S]*?\(month, role, user_id\)/);
  });

  it('refuses a pick that ends before it starts', () => {
    expect(sql).toMatch(/check \(ends_on >= starts_on\)/);
  });
});
