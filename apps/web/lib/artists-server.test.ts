import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { countWorkspaceArtists, listWorkspaceArtists } from './artists-server';

// Mirrors lib/seats-server.test.ts: the DB-touching helpers are covered by
// stubbing the exact query shape each one builds, which is enough to pin the
// two properties that matter — what is filtered, and what happens when the read
// fails.
//
// `checkArtistAllowance` is deliberately NOT covered here. It composes
// getWorkspaceTier (a real subscription read) with the counter below, and its
// decision logic is `checkLimit`, which entitlements.test.ts already pins on
// both sides. Stubbing a whole billing read to re-assert that would test the
// mock. Same reason checkSeatAllowance has no test beside countTeamSeats.

/** Stub of the head-count query countWorkspaceArtists builds. */
function stubCountClient(result: { count?: number | null; error?: { message: string } } | 'throw') {
  const eq = vi.fn(() =>
    result === 'throw' ? Promise.reject(new Error('boom')) : Promise.resolve(result)
  );
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from, select, eq };
}

/** Stub of the ordered list query listWorkspaceArtists builds. */
function stubListClient(result: { data?: unknown; error?: { message: string } }) {
  const order = vi.fn(() => Promise.resolve(result));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from, select, eq, order };
}

describe('countWorkspaceArtists', () => {
  it('counts every artist on the team', async () => {
    const { client } = stubCountClient({ count: 3 });
    expect(await countWorkspaceArtists(client, 'ws-1')).toBe(3);
  });

  it('scopes to the workspace and asks for a head-only exact count', async () => {
    const stub = stubCountClient({ count: 1 });
    await countWorkspaceArtists(stub.client, 'ws-1');
    expect(stub.from).toHaveBeenCalledWith('artists');
    expect(stub.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
    expect(stub.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
  });

  it('treats a null count as zero', async () => {
    const { client } = stubCountClient({ count: null });
    expect(await countWorkspaceArtists(client, 'ws-1')).toBe(0);
  });

  // FAIL OPEN, exactly as countTeamSeats does: null means "do not enforce" at
  // the call site, because refusing to add an artist over a transient database
  // error is a worse failure than briefly allowing one too many.
  it('returns null on a query error rather than guessing', async () => {
    const { client } = stubCountClient({ error: { message: 'connection reset' } });
    expect(await countWorkspaceArtists(client, 'ws-1')).toBeNull();
  });

  it('returns null when the query throws', async () => {
    const { client } = stubCountClient('throw');
    expect(await countWorkspaceArtists(client, 'ws-1')).toBeNull();
  });

  it('returns null for a missing workspace id without querying', async () => {
    const stub = stubCountClient({ count: 5 });
    expect(await countWorkspaceArtists(stub.client, '')).toBeNull();
    expect(stub.from).not.toHaveBeenCalled();
  });
});

describe('listWorkspaceArtists', () => {
  it('returns the team roster', async () => {
    const { client } = stubListClient({
      data: [
        { id: 'a1', workspace_id: 'ws-1', owner_user_id: 'u1', name: 'Tems', slug: 'tems' },
        { id: 'a2', workspace_id: 'ws-1', owner_user_id: 'u1', name: 'Odumodu', slug: 'odumodu' },
      ],
    });
    const artists = await listWorkspaceArtists(client, 'ws-1');
    expect(artists.map((artist) => artist.name)).toEqual(['Tems', 'Odumodu']);
    expect(artists[0]?.id).toBe('a1');
  });

  // OLDEST FIRST IS A CONTRACT, not a display preference. The first row is the
  // team's original artist, which is what getWorkspaceArtist returns and what
  // the implicit-artist path on release creation falls back to. Reordering this
  // silently changes which artist an API call that names none is filed under.
  it('orders oldest first', async () => {
    const stub = stubListClient({ data: [] });
    await listWorkspaceArtists(stub.client, 'ws-1');
    expect(stub.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(stub.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
  });

  it('returns an empty roster on a query error rather than throwing', async () => {
    const { client } = stubListClient({ error: { message: 'connection reset' } });
    expect(await listWorkspaceArtists(client, 'ws-1')).toEqual([]);
  });

  it('returns an empty roster for a missing workspace id without querying', async () => {
    const stub = stubListClient({ data: [] });
    expect(await listWorkspaceArtists(stub.client, '')).toEqual([]);
    expect(stub.from).not.toHaveBeenCalled();
  });

  it('tolerates missing columns rather than emitting undefined names', async () => {
    const { client } = stubListClient({ data: [{ id: 'a1' }] });
    expect(await listWorkspaceArtists(client, 'ws-1')).toEqual([
      { id: 'a1', workspaceId: '', ownerUserId: '', name: '', slug: '' },
    ]);
  });
});
