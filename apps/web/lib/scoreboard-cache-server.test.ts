import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createScoreboardReadCache, SCOREBOARD_READ_TTL_MS } from './scoreboard-cache-server';
import { loadScoreboardInput } from './scoreboard-server';
import { buildScoreboard } from './scoreboard';
import { attachOwnerContacts, buildFounderCockpit } from './founder-cockpit';
import { buildFunnels } from './admin-funnel';
import { buildUrgansUsage } from './admin-urgans-usage';
import { churnSummary } from './admin-churn';

// The shared read behind the cockpit and the Scoreboard (iteration 5). Two
// things are proved here: the cache reads once where it should, and every
// number the two pages show is the same whether its rows came from a fresh read
// or from the cache (and the same the second time the cached rows are used, so
// no builder changes its input).

const NOW = new Date('2026-10-10T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

type Tables = Record<string, Array<Record<string, unknown>>>;

/** An in-memory stand-in for Supabase: paging with range, `in` on profile ids,
 *  every other filter ignored, unknown tables empty. */
function fakeClient(tables: Tables): SupabaseClient {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      let inFilter: { column: string; values: unknown[] } | null = null;
      const result = (slice?: [number, number]) => {
        let data = rows;
        if (inFilter) {
          const filter = inFilter;
          data = data.filter((row) => filter.values.includes(row[filter.column]));
        }
        if (slice) data = data.slice(slice[0], slice[1] + 1);
        return Promise.resolve({ data, error: null });
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => builder,
        gte: () => builder,
        lt: () => builder,
        not: () => builder,
        is: () => builder,
        eq: () => builder,
        in: (column: string, values: unknown[]) => {
          if (column === 'id') inFilter = { column, values };
          return builder;
        },
        range: (from: number, to: number) => result([from, to]),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          result().then(resolve, reject),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const workspace = (id: string, owner: string, createdDaysAgo: number) => ({
  id,
  owner_id: owner,
  name: id,
  created_at: ago(createdDaysAgo),
  trial_started_at: ago(createdDaysAgo),
  trial_ends_at: ago(createdDaysAgo - 3),
  comped_at: null,
  billing_plan: null,
  billing_locked_amount: null,
});

const member = (workspaceId: string, userId: string, role = 'member') => ({
  workspace_id: workspaceId,
  user_id: userId,
  role,
  status: 'active',
  invited_at: ago(40),
  joined_at: ago(40),
});

function tables(): Tables {
  return {
    workspaces: [workspace('paying', 'ada', 120), workspace('trial', 'bo', 20), workspace('gone', 'cy', 200)],
    workspace_members: [
      member('paying', 'ada', 'owner'),
      member('paying', 'ada-mate'),
      member('trial', 'bo', 'owner'),
      member('trial', 'bo-mate'),
      member('gone', 'cy', 'owner'),
    ],
    profiles: [
      { id: 'ada', name: 'Ada Obi', email: 'ada@example.com', is_subscribed: true, paid_at: ago(30), created_at: ago(120) },
      { id: 'bo', name: 'Bo', email: 'bo@example.com', is_subscribed: false, paid_at: null, created_at: ago(20) },
      { id: 'cy', name: 'Cy', email: 'cy@example.com', is_subscribed: false, paid_at: ago(100), created_at: ago(200) },
    ],
    subscriptions: [
      { user_id: 'ada', plan: 'manager', status: 'active', amount: 2_200_000, billing_interval: 'monthly', expires_at: ahead(10), started_at: ago(110) },
      { user_id: 'cy', plan: 'label', status: 'expired', amount: 5_000_000, billing_interval: 'annual', expires_at: ago(25), started_at: ago(390) },
    ],
    artists: [{ id: 'artist-ada', workspace_id: 'paying' }],
    releases: [
      { id: 'r1', owner_user_id: 'ada', artist_id: 'artist-ada', created_at: ago(90), updated_at: ago(60), release_date: ago(50).slice(0, 10), status: 'draft', metadata: {} },
      { id: 'r2', owner_user_id: 'ada', artist_id: 'artist-ada', created_at: ago(10), updated_at: ago(2), release_date: null, status: 'draft', metadata: {} },
    ],
    tasks: [{ id: 't1', release_id: 'r2', status: 'done', completed_at: ago(2), updated_at: ago(2), auto_generated: false, created_at: ago(10) }],
    task_comments: [
      { user_id: 'ada', created_at: ago(1) },
      { user_id: 'ada-mate', created_at: ago(2) },
      { user_id: 'bo', created_at: ago(9) },
      { user_id: 'bo-mate', created_at: ago(10) },
    ],
  };
}

/** Every number the cockpit and the Scoreboard send, from one read. */
function everyNumber(loaded: Awaited<ReturnType<typeof loadScoreboardInput>>) {
  const { input, extras, sources } = loaded;
  const board = buildScoreboard(input);
  const cockpit = buildFounderCockpit(input, board);
  cockpit.atRisk = attachOwnerContacts(cockpit.atRisk, extras.ownerNames, extras.ownerEmails);
  return JSON.stringify({
    board,
    cockpit,
    funnels: buildFunnels(input, null, extras.ownerEmails),
    urgans: buildUrgansUsage(input, board.secondRelease, null, null, 1600),
    churn: churnSummary(input),
    sources,
  });
}

describe('the shared Scoreboard read', () => {
  it('gives the same numbers from the cache as from a fresh read, every time', async () => {
    const direct = everyNumber(await loadScoreboardInput(fakeClient(tables()), NOW));
    const cache = createScoreboardReadCache(loadScoreboardInput, SCOREBOARD_READ_TTL_MS, () => NOW.getTime());
    const client = fakeClient(tables());
    const first = everyNumber(await cache.get(client));
    const second = everyNumber(await cache.get(client));
    expect(first).toBe(direct);
    expect(second).toBe(direct);
    // Something real was counted, so the comparison is not of empty boards.
    const parsed = JSON.parse(direct);
    expect(parsed.board.payingTeams).toBe(1);
    expect(parsed.board.weeklyActivePayingTeams).toBe(1);
    expect(parsed.churn.months.some((month: { teamsLost: number }) => month.teamsLost === 1)).toBe(true);
  });

  it('reads once for two pages opened together', async () => {
    const load = vi.fn(loadScoreboardInput);
    const cache = createScoreboardReadCache(load, SCOREBOARD_READ_TTL_MS, () => NOW.getTime());
    const client = fakeClient(tables());
    const [a, b] = await Promise.all([cache.get(client), cache.get(client)]);
    await cache.get(client);
    expect(load).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('reads again once the read is a minute old, or when asked for a fresh one', async () => {
    let clock = NOW.getTime();
    const load = vi.fn(loadScoreboardInput);
    const cache = createScoreboardReadCache(load, SCOREBOARD_READ_TTL_MS, () => clock);
    const client = fakeClient(tables());
    await cache.get(client);
    clock += SCOREBOARD_READ_TTL_MS - 1;
    await cache.get(client);
    expect(load).toHaveBeenCalledTimes(1);
    clock += 1;
    const later = await cache.get(client);
    expect(load).toHaveBeenCalledTimes(2);
    // The rows are read "now", so time-based numbers move with the clock.
    expect(later.input.now.getTime()).toBe(clock);
    await cache.get(client, { fresh: true });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('never keeps a failed read', async () => {
    let fail = true;
    const load = vi.fn(async (client: SupabaseClient, now: Date) => {
      if (fail) throw new Error('database down');
      return loadScoreboardInput(client, now);
    });
    const cache = createScoreboardReadCache(load, SCOREBOARD_READ_TTL_MS, () => NOW.getTime());
    const client = fakeClient(tables());
    await expect(cache.get(client)).rejects.toThrow('database down');
    fail = false;
    await expect(cache.get(client)).resolves.toMatchObject({ input: { now: NOW } });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('forgets on clear', async () => {
    const load = vi.fn(loadScoreboardInput);
    const cache = createScoreboardReadCache(load, SCOREBOARD_READ_TTL_MS, () => NOW.getTime());
    const client = fakeClient(tables());
    await cache.get(client);
    cache.clear();
    await cache.get(client);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
