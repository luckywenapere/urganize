import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadPitchKit } from './release-epk-server';

type Canned = { data: unknown; error: { message: string } | null };
const ok = (data: unknown): Canned => ({ data, error: null });

/** Every query method returns the same chain; awaiting or maybeSingle() answers
 *  the table's canned result. */
function fakeAdmin(tables: Record<string, Canned>): SupabaseClient {
  return {
    from(table: string) {
      const answer = tables[table] ?? ok(null);
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'order', 'limit']) chain[method] = () => chain;
      chain.maybeSingle = () => Promise.resolve(answer);
      chain.then = (resolve: (value: Canned) => unknown) => resolve(answer);
      return chain;
    },
  } as unknown as SupabaseClient;
}

const release = {
  id: 'rel-1',
  owner_user_id: 'owner-1',
  title: 'Home',
  artist_id: 'artist-1',
  artist_name: 'Dorian',
  release_date: '2026-01-01',
  artwork_asset_id: null,
};

const liveTables = {
  releases: ok(release),
  release_credit_submissions: ok([]),
  press_kits: ok({
    id: 'kit-live',
    artist_id: 'artist-1',
    slug: 'dorian',
    state: 'published',
    published_at: '2026-09-01T00:00:00Z',
  }),
  press_kit_sections: ok([
    { kit_id: 'kit-live', section: 'bios', content: { short: 'The NEW bio.' } },
    { kit_id: 'kit-live', section: 'header', content: { descriptor: 'New descriptor' } },
  ]),
};

const frozenKit = {
  id: 'kit-old',
  artistId: 'artist-1',
  slug: 'dorian',
  state: 'published',
  publishedAt: '2025-12-01T00:00:00Z',
  descriptor: 'Old descriptor',
  shortBio: 'The OLD bio.',
  contactCount: 1,
};

describe('loadPitchKit and the delivery snapshot', () => {
  it('reads the live artist kit while the rollout has not been delivered', async () => {
    const result = await loadPitchKit(
      fakeAdmin({ ...liveTables, release_epk_fields: ok(null) }),
      'rel-1'
    );
    if ('error' in result) throw new Error(result.error);
    expect(result.pitchKit.kit?.shortBio).toBe('The NEW bio.');
    expect(result.pitchKit.kitFrozenAt).toBeNull();
  });

  it('reads the frozen copy once it exists, ignoring later edits to the artist kit', async () => {
    const result = await loadPitchKit(
      fakeAdmin({
        ...liveTables,
        release_epk_fields: ok({
          release_id: 'rel-1',
          story: '',
          kit_snapshot: frozenKit,
          kit_snapshot_at: '2026-01-02T00:00:00Z',
        }),
      }),
      'rel-1'
    );
    if ('error' in result) throw new Error(result.error);
    expect(result.pitchKit.kit?.shortBio).toBe('The OLD bio.');
    expect(result.pitchKit.kit?.descriptor).toBe('Old descriptor');
    expect(result.pitchKit.kitFrozenAt).toBe('2026-01-02T00:00:00Z');
  });

  it('falls back to the live kit when the stored snapshot is not usable', async () => {
    const result = await loadPitchKit(
      fakeAdmin({
        ...liveTables,
        release_epk_fields: ok({ release_id: 'rel-1', story: '', kit_snapshot: { junk: true } }),
      }),
      'rel-1'
    );
    if ('error' in result) throw new Error(result.error);
    expect(result.pitchKit.kit?.shortBio).toBe('The NEW bio.');
    expect(result.pitchKit.kitFrozenAt).toBeNull();
  });
});
