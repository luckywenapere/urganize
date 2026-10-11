import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addFeatured, loadShelves, removeFeatured, runOnTheRiseSweep } from './featured-shelves-server';

type Canned = { data: unknown; error: { message: string } | null };
type Call = { table: string; mode: 'insert' | 'upsert' | 'delete'; payload?: unknown };

const ok = (data: unknown): Canned => ({ data, error: null });
const NOW = new Date('2026-11-20T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

/**
 * A stand-in for the Supabase client. Every filter method returns the same
 * chain; awaiting it answers the table's canned rows; writes are recorded so a
 * test can say what was and was not written.
 */
function fakeAdmin(tables: Record<string, Canned>) {
  const calls: Call[] = [];
  const reads: string[] = [];
  const filters: Array<{ table: string; method: string; args: unknown[] }> = [];
  const client = {
    from(table: string) {
      let mode: 'select' | 'insert' | 'upsert' | 'delete' = 'select';
      let single = false;
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'order', 'limit', 'in', 'not', 'eq', 'neq', 'lte', 'gt', 'gte', 'or']) {
        chain[method] = (...args: unknown[]) => {
          filters.push({ table, method, args });
          return chain;
        };
      }
      chain.insert = (payload: unknown) => {
        mode = 'insert';
        calls.push({ table, mode, payload });
        return chain;
      };
      chain.upsert = (payload: unknown) => {
        mode = 'upsert';
        calls.push({ table, mode, payload });
        return chain;
      };
      chain.delete = () => {
        mode = 'delete';
        calls.push({ table, mode });
        return chain;
      };
      chain.single = () => {
        single = true;
        return chain;
      };
      chain.maybeSingle = () => {
        single = true;
        return chain;
      };
      chain.then = (resolve: (value: Canned) => unknown) => {
        if (mode === 'select') {
          reads.push(table);
          const canned = tables[table] ?? ok([]);
          if (single && Array.isArray(canned.data)) return resolve({ ...canned, data: canned.data[0] ?? null });
          return resolve(canned);
        }
        return resolve(ok(mode === 'insert' && single ? { id: 'new-id' } : null));
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, calls, reads, filters };
}

const writes = (calls: Call[], table: string, mode: Call['mode']) =>
  calls.filter((call) => call.table === table && call.mode === mode);

const profile = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  user_id: 'u1',
  status: 'claimed',
  visibility: 'directory',
  roles: ['producer'],
  ...over,
});

describe('addFeatured', () => {
  const input = { profileId: 'p1', role: 'producer', quarter: 'next' as const, adminUserId: 'admin' };

  it('saves a published person for the next quarter', async () => {
    const { client, calls } = fakeAdmin({ person_profiles: ok([profile()]) });
    const result = await addFeatured(client, input, NOW);
    expect(result).toEqual({ ok: true, id: 'new-id' });
    const [insert] = writes(calls, 'featured_profiles', 'insert');
    expect(insert.payload).toMatchObject({
      profile_id: 'p1',
      role: 'producer',
      starts_at: '2026-12-31T23:00:00.000Z',
      ends_at: '2027-03-31T23:00:00.000Z',
      created_by: 'admin',
    });
  });

  it('refuses a profile that is not published, and writes nothing', async () => {
    const { client, calls } = fakeAdmin({ person_profiles: ok([profile({ visibility: 'private' })]) });
    const result = await addFeatured(client, input, NOW);
    expect(result).toMatchObject({ ok: false, status: 409, code: 'not_published' });
    expect(writes(calls, 'featured_profiles', 'insert')).toHaveLength(0);
  });

  it('refuses a role the person has not claimed or delivered', async () => {
    const { client } = fakeAdmin({ person_profiles: ok([profile({ roles: ['manager'] })]) });
    expect(await addFeatured(client, input, NOW)).toMatchObject({ ok: false, code: 'role_not_held' });
  });

  it('accepts a role they delivered without having claimed it', async () => {
    const { client } = fakeAdmin({
      person_profiles: ok([profile({ roles: [] })]),
      delivery_records: ok([{ role: 'producer' }]),
    });
    expect(await addFeatured(client, input, NOW)).toMatchObject({ ok: true });
  });

  it('refuses a seventh person in a role', async () => {
    const full = Array.from({ length: 6 }, (_, i) => ({ profile_id: `other-${i}` }));
    const { client, calls } = fakeAdmin({ person_profiles: ok([profile()]), featured_profiles: ok(full) });
    expect(await addFeatured(client, input, NOW)).toMatchObject({ ok: false, code: 'role_full' });
    expect(writes(calls, 'featured_profiles', 'insert')).toHaveLength(0);
  });

  it('refuses a repeat pick and an unknown profile', async () => {
    const taken = fakeAdmin({ person_profiles: ok([profile()]), featured_profiles: ok([{ profile_id: 'p1' }]) });
    expect(await addFeatured(taken.client, input, NOW)).toMatchObject({ ok: false, code: 'already_featured' });
    const none = fakeAdmin({ person_profiles: ok([]) });
    expect(await addFeatured(none.client, input, NOW)).toMatchObject({ ok: false, status: 404 });
  });

  it('removes a pick', async () => {
    const { client, calls } = fakeAdmin({});
    expect(await removeFeatured(client, 'x')).toBe(true);
    expect(writes(calls, 'featured_profiles', 'delete')).toHaveLength(1);
  });
});

describe('loadShelves', () => {
  it('returns empty shelves when nothing is picked, never an error', async () => {
    const { client } = fakeAdmin({});
    const out = await loadShelves(client, 'viewer', NOW);
    expect(out.featured).toEqual([]);
    expect(out.onTheRise).toEqual([]);
    expect(out.viewerKind).toBe('artist');
  });

  it('shows a picked person who is still published, and drops one who went private', async () => {
    const { client } = fakeAdmin({
      featured_profiles: ok([
        { profile_id: 'p1', role: 'producer' },
        { profile_id: 'p2', role: 'producer' },
      ]),
      // The profile query already filters on published, so a private person is
      // simply absent from its answer.
      person_profiles: ok([
        { id: 'p1', user_id: 'u1', display_name: 'Tunde', slug: 'tunde', roles: ['producer'], city: 'Lagos', availability: 'open', visibility: 'public', status: 'claimed' },
      ]),
    });
    const out = await loadShelves(client, 'viewer', NOW);
    expect(out.featured.map((entry) => [entry.displayName, entry.shelfRole, entry.isPublic])).toEqual([
      ['Tunde', 'producer', true],
    ]);
  });

  it('asks only for picks that are live now, and only for published people', async () => {
    const { client, filters } = fakeAdmin({
      featured_profiles: ok([{ profile_id: 'p1', role: 'producer' }]),
      person_profiles: ok([]),
    });
    await loadShelves(client, 'viewer', NOW);
    const used = (table: string, method: string, ...args: unknown[]) =>
      filters.some(
        (filter) =>
          filter.table === table &&
          filter.method === method &&
          args.every((arg, index) => filter.args[index] === arg)
      );
    expect(used('featured_profiles', 'lte', 'starts_at', NOW.toISOString())).toBe(true);
    expect(used('featured_profiles', 'gt', 'ends_at', NOW.toISOString())).toBe(true);
    expect(used('on_the_rise_picks', 'eq', 'month', '2026-11-01')).toBe(true);
    expect(used('person_profiles', 'eq', 'status', 'claimed')).toBe(true);
    expect(used('person_profiles', 'neq', 'visibility', 'private')).toBe(true);
  });

  it('does not repeat a featured person under the same role on the rise', async () => {
    const row = { id: 'p1', user_id: 'u1', display_name: 'Tunde', slug: null, roles: [], city: null, availability: 'open', visibility: 'directory', status: 'claimed' };
    const { client } = fakeAdmin({
      featured_profiles: ok([{ profile_id: 'p1', role: 'producer' }]),
      on_the_rise_picks: ok([{ profile_id: 'p1', role: 'producer' }]),
      person_profiles: ok([row]),
    });
    const out = await loadShelves(client, 'viewer', NOW);
    expect(out.featured).toHaveLength(1);
    expect(out.onTheRise).toHaveLength(0);
  });
});

describe('runOnTheRiseSweep', () => {
  const settingsDone = { app_settings: ok([{ value_json: { month: '2026-11-01' } }]) };

  it('does nothing, and reads nothing else, when this month is already done', async () => {
    const { client, calls, reads } = fakeAdmin(settingsDone);
    expect(await runOnTheRiseSweep(client, NOW)).toEqual({ ran: false, reason: 'already_this_month' });
    expect(calls).toHaveLength(0);
    expect(reads).toEqual(['app_settings']);
  });

  it('stays empty and does not mark the month until thirty days of activity exist', async () => {
    const { client, calls } = fakeAdmin({
      app_settings: ok([]),
      task_activity: ok([{ created_at: daysAgo(10) }]),
    });
    expect(await runOnTheRiseSweep(client, NOW)).toEqual({ ran: false, reason: 'not_enough_history' });
    expect(calls).toHaveLength(0);
  });

  it('treats a failed read as not ran, and writes nothing', async () => {
    const { client, calls } = fakeAdmin({ app_settings: { data: null, error: { message: 'x' } } });
    expect(await runOnTheRiseSweep(client, NOW)).toEqual({ ran: false, reason: 'read_failed' });
    expect(calls).toHaveLength(0);
  });

  it('computes the picks, writes them, clears other months and marks the month', async () => {
    const { client, calls } = fakeAdmin({
      app_settings: ok([]),
      task_activity: ok([{ task_id: 't1', actor_id: 'x', created_at: daysAgo(45) }]),
      person_profiles: ok([{ id: 'p1', user_id: 'u1', status: 'claimed', visibility: 'directory', roles: [] }]),
      releases: ok([
        { id: 'r1', owner_user_id: 'owner', release_date: daysAgo(20).slice(0, 10), status: 'draft', metadata: {}, updated_at: daysAgo(20) },
      ]),
      tasks: ok([{ id: 't1', release_id: 'r1', status: 'done', completed_at: daysAgo(21) }]),
      delivery_records: ok([{ user_id: 'u1', role: 'producer', release_id: 'r1' }]),
    });
    const result = await runOnTheRiseSweep(client, NOW);
    expect(result).toEqual({ ran: true, month: '2026-11-01', picks: 1 });
    const [upsert] = writes(calls, 'on_the_rise_picks', 'upsert');
    expect(upsert.payload).toEqual([
      { profile_id: 'p1', role: 'producer', month: '2026-11-01', computed_at: NOW.toISOString() },
    ]);
    expect(writes(calls, 'on_the_rise_picks', 'delete').length).toBeGreaterThan(0);
    const [mark] = writes(calls, 'app_settings', 'upsert');
    expect(mark.payload).toMatchObject({ key: 'on_the_rise_month', value_json: { month: '2026-11-01' } });
  });

  it('runs again when only an older month is marked', async () => {
    const { client } = fakeAdmin({
      app_settings: ok([{ value_json: { month: '2026-10-01' } }]),
      task_activity: ok([{ created_at: daysAgo(45) }]),
    });
    const result = await runOnTheRiseSweep(client, NOW);
    expect(result.ran).toBe(true);
  });
});
