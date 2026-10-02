import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runKitSnapshotSweep } from './release-epk-snapshot-server';

type Canned = { data: unknown; error: { message: string } | null };

/**
 * A stand-in for the Supabase client: every query method returns the same
 * chain, awaiting it answers the table's canned result, and every upsert is
 * recorded. Enough to drive the sweep without a database.
 */
function fakeAdmin(tables: Record<string, Canned>, upsertError = false) {
  const upserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'order', 'limit', 'in', 'not', 'eq']) {
        chain[method] = () => chain;
      }
      let isUpsert = false;
      chain.upsert = (row: Record<string, unknown>) => {
        upserts.push({ table, row });
        isUpsert = true;
        return chain;
      };
      chain.then = (resolve: (value: Canned) => unknown) =>
        resolve(isUpsert ? { data: null, error: upsertError ? { message: 'x' } : null } : tables[table] ?? { data: [], error: null });
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, upserts };
}

const ok = (data: unknown): Canned => ({ data, error: null });

const PAST = '2020-01-01';
const FUTURE = '2999-01-01';

const baseTables = (over: Record<string, Canned> = {}): Record<string, Canned> => ({
  releases: ok([
    { id: 'rel-old', owner_user_id: 'owner-1', artist_id: 'artist-1', release_date: PAST, status: 'draft' },
  ]),
  tasks: ok([]),
  release_epk_fields: ok([]),
  press_kits: ok([
    { id: 'kit-1', artist_id: 'artist-1', slug: 'dorian', state: 'published', published_at: '2026-09-01T00:00:00Z' },
  ]),
  press_kit_sections: ok([
    { kit_id: 'kit-1', section: 'header', content: { descriptor: 'Afro-fusion singer' } },
    { kit_id: 'kit-1', section: 'bios', content: { short: 'Short bio.' } },
    { kit_id: 'kit-1', section: 'contact', content: { contacts: [{}, {}] } },
  ]),
  ...over,
});

describe('runKitSnapshotSweep', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_FEATURE_PITCH_KIT', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('does nothing while the pitch kit flag is off', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PITCH_KIT', 'false');
    const { client, upserts } = fakeAdmin(baseTables());
    expect(await runKitSnapshotSweep(client)).toEqual({ skipped: true, reason: 'flag_off' });
    expect(upserts).toHaveLength(0);
  });

  it('freezes the kit onto a release whose date has passed', async () => {
    const { client, upserts } = fakeAdmin(baseTables());
    const result = await runKitSnapshotSweep(client);
    expect(result).toMatchObject({ skipped: false, delivered: 1, frozen: 1, failed: 0 });
    expect(upserts).toHaveLength(1);
    expect(upserts[0].row).toMatchObject({
      release_id: 'rel-old',
      owner_user_id: 'owner-1',
      kit_snapshot: {
        slug: 'dorian',
        descriptor: 'Afro-fusion singer',
        shortBio: 'Short bio.',
        contactCount: 2,
      },
    });
  });

  it('writes only the snapshot columns, so a story and credits are never touched', async () => {
    const { client, upserts } = fakeAdmin(baseTables());
    await runKitSnapshotSweep(client);
    expect(Object.keys(upserts[0].row).sort()).toEqual(
      ['kit_snapshot', 'kit_snapshot_at', 'owner_user_id', 'release_id']
    );
  });

  it('leaves a release that has not happened yet reading the live kit', async () => {
    const { client, upserts } = fakeAdmin(
      baseTables({
        releases: ok([
          { id: 'rel-new', owner_user_id: 'owner-1', artist_id: 'artist-1', release_date: FUTURE, status: 'draft' },
        ]),
      })
    );
    const result = await runKitSnapshotSweep(client);
    expect(result).toMatchObject({ skipped: false, delivered: 0, frozen: 0 });
    expect(upserts).toHaveLength(0);
  });

  it('counts a release as delivered once every activity is done, even with no date', async () => {
    const { client, upserts } = fakeAdmin(
      baseTables({
        releases: ok([
          { id: 'rel-done', owner_user_id: 'owner-1', artist_id: 'artist-1', release_date: null, status: 'draft' },
        ]),
        tasks: ok([
          { release_id: 'rel-done', status: 'done' },
          { release_id: 'rel-done', status: 'done' },
        ]),
      })
    );
    await runKitSnapshotSweep(client);
    expect(upserts.map((u) => u.row.release_id)).toEqual(['rel-done']);
  });

  it('does not count one unfinished activity as delivered', async () => {
    const { client, upserts } = fakeAdmin(
      baseTables({
        releases: ok([
          { id: 'rel-open', owner_user_id: 'owner-1', artist_id: 'artist-1', release_date: null, status: 'draft' },
        ]),
        tasks: ok([
          { release_id: 'rel-open', status: 'done' },
          { release_id: 'rel-open', status: 'todo' },
        ]),
      })
    );
    await runKitSnapshotSweep(client);
    expect(upserts).toHaveLength(0);
  });

  it('never re-freezes a release that already has a copy', async () => {
    const { client, upserts } = fakeAdmin(baseTables({ release_epk_fields: ok([{ release_id: 'rel-old' }]) }));
    const result = await runKitSnapshotSweep(client);
    expect(result).toMatchObject({ skipped: false, frozen: 0 });
    expect(upserts).toHaveLength(0);
  });

  it('skips a delivered release whose artist has no kit', async () => {
    const { client, upserts } = fakeAdmin(baseTables({ press_kits: ok([]) }));
    const result = await runKitSnapshotSweep(client);
    expect(result).toMatchObject({ skipped: false, delivered: 1, frozen: 0 });
    expect(upserts).toHaveLength(0);
  });

  // The column arrives with a migration applied by hand. Until it is there the
  // read fails, and guessing "nothing is frozen" would rewrite old releases.
  it('stops without writing when the snapshot column cannot be read', async () => {
    const { client, upserts } = fakeAdmin(
      baseTables({ release_epk_fields: { data: null, error: { message: 'column does not exist' } } })
    );
    expect(await runKitSnapshotSweep(client)).toEqual({ skipped: true, reason: 'snapshot_column_missing' });
    expect(upserts).toHaveLength(0);
  });

  it('reports a failed write instead of counting it as frozen', async () => {
    const { client } = fakeAdmin(baseTables(), true);
    expect(await runKitSnapshotSweep(client)).toMatchObject({ frozen: 0, failed: 1 });
  });

  it('stops when the release list cannot be read', async () => {
    const { client, upserts } = fakeAdmin(baseTables({ releases: { data: null, error: { message: 'down' } } }));
    expect(await runKitSnapshotSweep(client)).toEqual({ skipped: true, reason: 'read_failed' });
    expect(upserts).toHaveLength(0);
  });
});
