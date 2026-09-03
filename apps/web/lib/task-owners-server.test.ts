import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadPastAssignments } from './task-owners-server';

/** Minimal stub of the exact query chain loadPastAssignments builds:
 *  from -> select -> eq -> neq -> not -> neq -> order -> limit. */
function stubClient(result: { data?: unknown; error?: { message: string } } | 'throw') {
  const limit = vi.fn(() => (result === 'throw' ? Promise.reject(new Error('boom')) : Promise.resolve(result)));
  const order = vi.fn(() => ({ limit }));
  const neq2 = vi.fn(() => ({ order }));
  const not = vi.fn(() => ({ neq: neq2 }));
  const neq1 = vi.fn(() => ({ not }));
  const eq = vi.fn(() => ({ neq: neq1 }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from, select, eq, neq1, not, neq2, order, limit };
}

describe('loadPastAssignments', () => {
  it('maps rows into template-task-id, role and assignee', async () => {
    const { client } = stubClient({
      data: [
        {
          assigned_to_user_id: 'ada',
          metadata: { template: { task_id: 'w6_cover_art_first_draft', role: 'design' } },
        },
        {
          assigned_to_user_id: 'ben',
          metadata: { template: { task_id: 'w1_kickoff' } },
        },
      ],
    });

    expect(await loadPastAssignments(client, {
      workspaceId: 'ws-1',
      ownerUserId: 'owner-1',
      excludeReleaseId: 'release-current',
    })).toEqual([
      { templateTaskId: 'w6_cover_art_first_draft', role: 'design', assignedToUserId: 'ada' },
      { templateTaskId: 'w1_kickoff', role: null, assignedToUserId: 'ben' },
    ]);
  });

  it('queries the workspace, excludes this release, and excludes the owner as the assignee', async () => {
    const stub = stubClient({ data: [] });
    await loadPastAssignments(stub.client, {
      workspaceId: 'ws-1',
      ownerUserId: 'owner-1',
      excludeReleaseId: 'release-current',
    });

    expect(stub.from).toHaveBeenCalledWith('tasks');
    expect(stub.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
    expect(stub.neq1).toHaveBeenCalledWith('release_id', 'release-current');
    expect(stub.not).toHaveBeenCalledWith('assigned_to_user_id', 'is', null);
    expect(stub.neq2).toHaveBeenCalledWith('assigned_to_user_id', 'owner-1');
    expect(stub.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('tolerates a metadata shape with no template block', async () => {
    const { client } = stubClient({
      data: [{ assigned_to_user_id: 'ada', metadata: {} }, { assigned_to_user_id: 'ben', metadata: null }],
    });
    expect(await loadPastAssignments(client, { workspaceId: 'ws-1', ownerUserId: 'owner-1', excludeReleaseId: 'r1' })).toEqual([
      { templateTaskId: null, role: null, assignedToUserId: 'ada' },
      { templateTaskId: null, role: null, assignedToUserId: 'ben' },
    ]);
  });

  it('skips a row with no assignee rather than throwing', async () => {
    const { client } = stubClient({
      data: [{ assigned_to_user_id: null, metadata: {} }, { assigned_to_user_id: 'ada', metadata: {} }],
    });
    const result = await loadPastAssignments(client, {
      workspaceId: 'ws-1',
      ownerUserId: 'owner-1',
      excludeReleaseId: 'r1',
    });
    expect(result).toHaveLength(1);
    expect(result[0].assignedToUserId).toBe('ada');
  });

  it('returns an empty list on a query error rather than throwing', async () => {
    const { client } = stubClient({ error: { message: 'connection reset' } });
    expect(await loadPastAssignments(client, { workspaceId: 'ws-1', ownerUserId: 'owner-1', excludeReleaseId: 'r1' })).toEqual([]);
  });

  it('returns an empty list when the query throws', async () => {
    const { client } = stubClient('throw');
    expect(await loadPastAssignments(client, { workspaceId: 'ws-1', ownerUserId: 'owner-1', excludeReleaseId: 'r1' })).toEqual([]);
  });
});
