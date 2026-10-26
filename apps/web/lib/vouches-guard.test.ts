import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vouch, slice 1. Like lib/relationships-guard.test.ts (which already holds
// every route under app/api/relationships to the shared team gate), these read
// the real sources, because the properties that matter cannot live in a
// comment: every query is scoped to the caller's team, the table is private,
// and a bulk Mark done never asks for a vouch.

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const SERVER = stripComments(readFileSync(join(__dirname, 'vouches-server.ts'), 'utf8'));
const STORE = stripComments(readFileSync(join(__dirname, '..', 'stores', 'useTaskStore.ts'), 'utf8'));
const MIGRATION = readFileSync(
  join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261024200000_vouches.sql'),
  'utf8'
);

describe('vouches-server', () => {
  for (const table of ['TASKS', 'RELATIONSHIPS', 'VOUCHES']) {
    it(`scopes every query on ${table} to the team`, () => {
      const queries = SERVER.split(`.from(${table})`).slice(1);
      expect(queries.length).toBeGreaterThan(0);
      for (const query of queries) {
        const statement = query.slice(0, query.indexOf(';'));
        expect(statement, statement).toMatch(/workspace_id/);
      }
    });
  }

  it('only writes the person column on an activity', () => {
    const updates = [...SERVER.matchAll(/\.from\(TASKS\)\s*\.update\(([^)]*)\)/g)].map((match) => match[1]);
    expect(updates).toEqual(['{ assigned_person_id: personId }']);
  });
});

describe('the vouch prompt', () => {
  it('is never asked in quiet mode, so a bulk Mark done asks nothing', () => {
    const decision = STORE.slice(STORE.indexOf('const vouchPersonId'), STORE.indexOf('const shouldPromptVouch'));
    expect(decision).toContain('!quiet');
  });

  it('bulk completion still runs each activity quietly', () => {
    expect(STORE).toContain('completeTask(id, { quiet: true })');
  });

  it('closes when the activity is reopened or the save fails', () => {
    expect(STORE.match(/state\.vouchPrompt\?\.taskId === taskId \? null : state\.vouchPrompt/g)?.length).toBe(2);
  });
});

describe('vouches migration', () => {
  it('keeps the table private: row level security on and a select-only policy', () => {
    expect(MIGRATION).toContain('alter table public.person_vouches enable row level security');
    const policies = MIGRATION.match(/create policy[\s\S]*?on public\.\w+ for (\w+)/g) || [];
    expect(policies.length).toBe(1);
    for (const policy of policies) expect(policy.endsWith(' select')).toBe(true);
  });

  it('allows one vouch per team per person per skill, and a note of 140 at most', () => {
    expect(MIGRATION).toContain('on public.person_vouches(workspace_id, person_id, skill)');
    expect(MIGRATION).toMatch(/create unique index if not exists person_vouches_team_person_skill_key/);
    expect(MIGRATION).toContain('char_length(note) <= 140');
  });

  it('grants explicitly (Supabase stops auto-granting on 30 Oct 2026)', () => {
    expect(MIGRATION).toContain('grant select, insert, update, delete on public.person_vouches to authenticated, service_role');
  });

  it('adds and never drops', () => {
    const statements = MIGRATION.replace(/--.*$/gm, '');
    expect(statements).not.toMatch(/\bdrop\s+(table|column)\b/i);
    expect(statements).not.toMatch(/\bdelete\s+from\b/i);
  });
});
