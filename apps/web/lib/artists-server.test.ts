import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  countWorkspaceArtists,
  describeArtistDeletionBlock,
  listWorkspaceArtists,
  reassignReleaseArtist,
} from './artists-server';

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

/**
 * Stub for reassignReleaseArtist, which touches TWO tables:
 *   releases:         .update().eq('id').select('id').maybeSingle()
 *   release_metadata: .update().eq('release_id')
 * Records the payload written to each so the three-write contract can be
 * asserted rather than assumed.
 */
function stubReassignClient(options?: {
  releaseResult?: { data?: unknown; error?: { message: string } };
  metadataError?: { message: string };
}) {
  const releaseResult = options?.releaseResult ?? { data: { id: 'r1' } };
  const writes: Record<string, Record<string, unknown>> = {};
  const filters: Record<string, [string, string]> = {};

  const from = vi.fn((table: string) => ({
    update: (payload: Record<string, unknown>) => {
      writes[table] = payload;
      return {
        eq: (column: string, value: string) => {
          filters[table] = [column, value];
          return {
            select: () => ({ maybeSingle: () => Promise.resolve(releaseResult) }),
            // release_metadata terminates at .eq(), so it must be awaitable.
            then: (resolve: (v: unknown) => unknown) =>
              resolve({ error: options?.metadataError ?? null }),
          };
        },
      };
    },
  }));

  return { client: { from } as unknown as SupabaseClient, writes, filters, from };
}

const ARTIST = { id: 'a2', workspaceId: 'ws-1', ownerUserId: 'u1', name: 'Odumodu', slug: 'odumodu' };

describe('reassignReleaseArtist', () => {
  // THE CONTRACT. Missing either cached name would not throw — the release
  // would just show the old artist everywhere while being filed under the new
  // one, which is worse than an error because nothing would look wrong.
  it('writes the link and BOTH cached names', async () => {
    const stub = stubReassignClient();
    const result = await reassignReleaseArtist(stub.client, { releaseId: 'r1', artist: ARTIST });

    expect(result.error).toBeNull();
    expect(stub.writes.releases).toMatchObject({
      artist_id: 'a2',
      artist_name: 'Odumodu',
    });
    expect(stub.writes.release_metadata).toMatchObject({ primary_artist_name: 'Odumodu' });
  });

  it('scopes each write to the one release', async () => {
    const stub = stubReassignClient();
    await reassignReleaseArtist(stub.client, { releaseId: 'r1', artist: ARTIST });
    expect(stub.filters.releases).toEqual(['id', 'r1']);
    expect(stub.filters.release_metadata).toEqual(['release_id', 'r1']);
  });

  it('reports a missing release rather than silently succeeding', async () => {
    const stub = stubReassignClient({ releaseResult: { data: null } });
    const result = await reassignReleaseArtist(stub.client, { releaseId: 'gone', artist: ARTIST });
    expect(result.error).toBe('Release not found.');
  });

  it('surfaces a failed release write', async () => {
    const stub = stubReassignClient({ releaseResult: { error: { message: 'connection reset' } } });
    const result = await reassignReleaseArtist(stub.client, { releaseId: 'r1', artist: ARTIST });
    expect(result.error).toBe('connection reset');
  });

  // The sidecar is a second copy of a name the release row already carries, so
  // failing the whole request over it would tell the user nothing moved when
  // the link and the visible label both did. Same call the rename path makes.
  it('still succeeds when only the metadata sidecar fails', async () => {
    const stub = stubReassignClient({ metadataError: { message: 'nope' } });
    const result = await reassignReleaseArtist(stub.client, { releaseId: 'r1', artist: ARTIST });
    expect(result.error).toBeNull();
  });
});

describe('describeArtistDeletionBlock', () => {
  it('allows a removal that loses nothing', () => {
    expect(describeArtistDeletionBlock({ releases: 0, scopedMembers: 0 })).toBeNull();
  });

  // FAILS CLOSED, unlike every other count in this module. Being wrong here
  // destroys a link or widens someone's access; being wrong the other way just
  // makes a manager retry.
  it('refuses when it could not read what would be lost', () => {
    const message = describeArtistDeletionBlock(null);
    expect(message).not.toBeNull();
    expect(message).toMatch(/try again/i);
  });

  it('names how many releases are in the way, and what to do', () => {
    const message = describeArtistDeletionBlock({ releases: 3, scopedMembers: 0 }) ?? '';
    expect(message).toContain('3');
    expect(message).toMatch(/move/i);
  });

  // The quieter harm, and the one nothing in the database stops:
  // artist_scope_id is ON DELETE SET NULL and NULL means FULL visibility, so a
  // silent removal promotes a scoped teammate to seeing every release. The copy
  // has to say that, not just refuse.
  it('says what happens to a scoped teammate rather than only refusing', () => {
    const message = describeArtistDeletionBlock({ releases: 0, scopedMembers: 2 }) ?? '';
    expect(message).toContain('2');
    expect(message).toMatch(/every release/i);
  });

  it('covers both blockers in one message when both apply', () => {
    const message = describeArtistDeletionBlock({ releases: 1, scopedMembers: 1 }) ?? '';
    expect(message).toMatch(/release/i);
    expect(message).toMatch(/access/i);
  });

  it('reads naturally for one of each', () => {
    expect(describeArtistDeletionBlock({ releases: 1, scopedMembers: 0 })).toContain('1 release.');
    expect(describeArtistDeletionBlock({ releases: 0, scopedMembers: 1 })).toContain('1 person');
  });
});
