import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { DIRECTORY_ROLES } from './directory-roles';

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
