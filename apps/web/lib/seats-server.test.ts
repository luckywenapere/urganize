import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { countTeamSeats } from './seats-server';

/** Minimal stub of the one query shape countTeamSeats builds. */
function stubClient(result: { count?: number | null; error?: { message: string } } | 'throw') {
  const or = vi.fn(() => (result === 'throw' ? Promise.reject(new Error('boom')) : Promise.resolve(result)));
  const neq = vi.fn(() => ({ or }));
  const eq = vi.fn(() => ({ neq }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from, select, eq, neq, or };
}

describe('countTeamSeats', () => {
  it('counts the rows the team list shows', async () => {
    const { client } = stubClient({ count: 3 });
    expect(await countTeamSeats(client, 'ws-1')).toBe(3);
  });

  it('counts invited and active, excluding only removed', async () => {
    // The filter is the contract: it must match loadWorkspaceMembers, or the
    // count disagrees with the list the manager is looking at.
    const stub = stubClient({ count: 0 });
    await countTeamSeats(stub.client, 'ws-1');
    expect(stub.from).toHaveBeenCalledWith('workspace_members');
    expect(stub.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
    expect(stub.neq).toHaveBeenCalledWith('status', 'removed');
  });

  it('leaves out guests invited from a brief (Oyin, 31 Oct 2026)', async () => {
    const stub = stubClient({ count: 0 });
    await countTeamSeats(stub.client, 'ws-1');
    expect(stub.or).toHaveBeenCalledWith('brief_release_id.is.null,role.neq.guest');
  });

  it('asks for a head-only exact count, not the rows', async () => {
    const stub = stubClient({ count: 1 });
    await countTeamSeats(stub.client, 'ws-1');
    expect(stub.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
  });

  it('treats a null count as zero', async () => {
    const { client } = stubClient({ count: null });
    expect(await countTeamSeats(client, 'ws-1')).toBe(0);
  });

  // FAIL OPEN. A null here means "do not enforce" at every call site, because
  // turning a transient database blip into a team that cannot grow is a far
  // worse failure than briefly allowing one seat too many.
  it('returns null on a query error rather than guessing a count', async () => {
    const { client } = stubClient({ error: { message: 'connection reset' } });
    expect(await countTeamSeats(client, 'ws-1')).toBeNull();
  });

  it('returns null when the query throws', async () => {
    const { client } = stubClient('throw');
    expect(await countTeamSeats(client, 'ws-1')).toBeNull();
  });

  it('returns null for a missing workspace id without querying', async () => {
    const stub = stubClient({ count: 5 });
    expect(await countTeamSeats(stub.client, '')).toBeNull();
    expect(stub.from).not.toHaveBeenCalled();
  });
});
