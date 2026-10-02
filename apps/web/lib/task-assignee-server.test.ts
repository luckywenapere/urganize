import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isTeamAssignee } from './task-assignee-server';

// Both ways an assignee gets written must ask the same question. The create
// route skipped it for months, so the test reads the real route sources.
describe('every route that writes an assignee checks the team', () => {
  const root = join(__dirname, '..', 'app', 'api', 'tasks');
  for (const file of ['route.ts', join('[id]', 'route.ts')]) {
    it(`${file} calls isTeamAssignee`, () => {
      const source = readFileSync(join(root, file), 'utf8');
      expect(source).toContain('isTeamAssignee(');
    });
  }
});

type Answer = { data: unknown; error: { message: string } | null };

/** Answers each table's query with a canned row; every filter is recorded. */
function stub(answers: Record<string, Answer>) {
  const filters: Array<{ table: string; column: string; value: unknown }> = [];
  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (column: string, value: unknown) => {
        filters.push({ table, column, value });
        return chain;
      };
      chain.maybeSingle = () => Promise.resolve(answers[table] ?? { data: null, error: null });
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, filters };
}

const none: Answer = { data: null, error: null };
const row: Answer = { data: { id: 'x' }, error: null };

describe('isTeamAssignee', () => {
  it('accepts an active member', async () => {
    const { client } = stub({ workspace_members: row, workspaces: none });
    expect(await isTeamAssignee(client, 'ws-1', 'user-1')).toBe(true);
  });

  it('accepts the team owner, who has no member row', async () => {
    const { client } = stub({ workspace_members: none, workspaces: row });
    expect(await isTeamAssignee(client, 'ws-1', 'owner-1')).toBe(true);
  });

  it('refuses somebody who is neither', async () => {
    const { client } = stub({ workspace_members: none, workspaces: none });
    expect(await isTeamAssignee(client, 'ws-1', 'stranger')).toBe(false);
  });

  it('only counts an ACTIVE membership, not an invited one', async () => {
    const { client, filters } = stub({ workspace_members: none, workspaces: none });
    await isTeamAssignee(client, 'ws-1', 'user-1');
    expect(filters).toContainEqual({ table: 'workspace_members', column: 'status', value: 'active' });
  });

  it('scopes both lookups to the workspace and the user asked about', async () => {
    const { client, filters } = stub({});
    await isTeamAssignee(client, 'ws-9', 'user-9');
    expect(filters).toContainEqual({ table: 'workspace_members', column: 'workspace_id', value: 'ws-9' });
    expect(filters).toContainEqual({ table: 'workspace_members', column: 'user_id', value: 'user-9' });
    expect(filters).toContainEqual({ table: 'workspaces', column: 'owner_id', value: 'user-9' });
  });

  it('refuses an empty id without querying', async () => {
    const { client, filters } = stub({ workspace_members: row });
    expect(await isTeamAssignee(client, '', 'user-1')).toBe(false);
    expect(await isTeamAssignee(client, 'ws-1', '')).toBe(false);
    expect(filters).toHaveLength(0);
  });

  it('throws on a query error instead of saying yes or no', async () => {
    const { client } = stub({ workspace_members: { data: null, error: { message: 'down' } } });
    await expect(isTeamAssignee(client, 'ws-1', 'user-1')).rejects.toEqual({ message: 'down' });
  });
});
