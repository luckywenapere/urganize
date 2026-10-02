import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadScoreboardInput } from './scoreboard-server';

// The reads behind the scoreboard, driven against an in-memory stand-in for
// Supabase. It honours what loadScoreboardInput relies on (paging with range,
// `in` on profiles, a missing table) and ignores the rest, which the counting
// rules in scoreboard.test.ts already cover.

const NOW = new Date('2026-10-02T12:00:00.000Z');

type Tables = Record<string, Array<Record<string, unknown>> | 'missing'>;

function fakeClient(tables: Tables): SupabaseClient {
  return {
    from(table: string) {
      const rows = tables[table];
      let inFilter: { column: string; values: unknown[] } | null = null;
      const result = (slice?: [number, number]) => {
        if (rows === 'missing') {
          return Promise.resolve({
            data: null,
            error: { code: '42P01', message: `relation "public.${table}" does not exist` },
          });
        }
        let data = rows ?? [];
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
        not: () => builder,
        eq: () => builder,
        in: (column: string, values: unknown[]) => {
          // billing_events filters on `type`; the rows below carry none, so
          // only the profiles lookup by id is applied.
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

const workspace = (id: string, owner: string, over: Record<string, unknown> = {}) => ({
  id,
  owner_id: owner,
  name: id,
  created_at: '2026-06-01T00:00:00.000Z',
  trial_started_at: null,
  trial_ends_at: null,
  comped_at: null,
  billing_plan: null,
  billing_locked_amount: null,
  ...over,
});

const member = (workspaceId: string, userId: string, role = 'member', status = 'active') => ({
  workspace_id: workspaceId,
  user_id: userId,
  role,
  status,
  invited_at: '2026-06-02T00:00:00.000Z',
  joined_at: '2026-06-02T00:00:00.000Z',
});

describe('loadScoreboardInput', () => {
  it("leaves out an invited teammate's own empty team", async () => {
    const client = fakeClient({
      workspaces: [workspace('team', 'boss'), workspace('shell', 'helper')],
      workspace_members: [
        member('team', 'boss', 'owner'),
        member('team', 'helper'),
        member('shell', 'helper', 'owner'),
      ],
    });
    const { input } = await loadScoreboardInput(client, NOW);
    expect(input.teams.map((team) => team.workspaceId)).toEqual(['team']);
    expect(input.teams[0].memberUserIds.sort()).toEqual(['boss', 'helper']);
  });

  it("keeps a teammate's own team once it has a real release of its own", async () => {
    const client = fakeClient({
      workspaces: [workspace('team', 'boss'), workspace('side', 'helper')],
      workspace_members: [member('team', 'helper')],
      artists: [{ id: 'artist-side', workspace_id: 'side' }],
      releases: [
        {
          id: 'r1',
          owner_user_id: 'helper',
          artist_id: 'artist-side',
          created_at: '2026-07-01T00:00:00.000Z',
          updated_at: '2026-07-01T00:00:00.000Z',
          release_date: null,
          status: 'draft',
          metadata: {},
        },
      ],
    });
    const { input } = await loadScoreboardInput(client, NOW);
    expect(input.teams.map((team) => team.workspaceId).sort()).toEqual(['side', 'team']);
  });

  it("files a release under its artist's team, not the account that made it", async () => {
    const client = fakeClient({
      workspaces: [workspace('team', 'boss'), workspace('helper-own', 'helper')],
      workspace_members: [member('team', 'helper')],
      artists: [{ id: 'artist-1', workspace_id: 'team' }],
      releases: [
        {
          id: 'r1',
          owner_user_id: 'helper',
          artist_id: 'artist-1',
          created_at: '2026-07-01T00:00:00.000Z',
          updated_at: '2026-07-01T00:00:00.000Z',
          release_date: '2026-08-01',
          status: 'draft',
          metadata: {},
        },
      ],
    });
    const { input } = await loadScoreboardInput(client, NOW);
    expect(input.releases).toHaveLength(1);
    expect(input.releases[0].workspaceId).toBe('team');
  });

  it('reads past the first 1,000 rows', async () => {
    const tasks = Array.from({ length: 2500 }, (_, index) => ({
      id: `t${index}`,
      release_id: 'r1',
      status: 'done',
      completed_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    }));
    const client = fakeClient({
      workspaces: [workspace('team', 'boss')],
      artists: [{ id: 'artist-1', workspace_id: 'team' }],
      releases: [
        {
          id: 'r1',
          owner_user_id: 'boss',
          artist_id: 'artist-1',
          created_at: '2026-07-01T00:00:00.000Z',
          updated_at: '2026-07-01T00:00:00.000Z',
          release_date: null,
          status: 'draft',
          metadata: {},
        },
      ],
      tasks,
    });
    const { input, sources } = await loadScoreboardInput(client, NOW);
    expect(input.releases[0].taskCount).toBe(2500);
    expect(input.releases[0].allTasksDone).toBe(true);
    expect(sources.find((source) => source.table === 'tasks (status)')?.truncated).toBe(false);
  });

  it('reports a missing table and still builds the rest', async () => {
    const client = fakeClient({
      workspaces: [workspace('team', 'boss')],
      release_messages: 'missing',
      task_comments: [{ user_id: 'boss', created_at: '2026-10-01T00:00:00.000Z' }],
    });
    const { input, sources } = await loadScoreboardInput(client, NOW);
    expect(sources.find((source) => source.table === 'release_messages')?.status).toBe('missing');
    expect(input.activity.get('boss')).toEqual([Date.parse('2026-10-01T00:00:00.000Z')]);
  });

  it('takes the team state and subscription from the owner', async () => {
    const client = fakeClient({
      workspaces: [workspace('team', 'boss')],
      profiles: [{ id: 'boss', email: 'boss@example.com', is_subscribed: false, paid_at: '2026-09-01T00:00:00.000Z', created_at: '2026-06-01T00:00:00.000Z' }],
      subscriptions: [
        {
          user_id: 'boss',
          plan: 'manager',
          status: 'active',
          amount: 2_200_000,
          billing_interval: 'monthly',
          expires_at: '2026-10-20T00:00:00.000Z',
        },
      ],
    });
    const { input } = await loadScoreboardInput(client, NOW);
    expect(input.teams[0]).toMatchObject({
      state: 'paid',
      ownerSignedUpAt: '2026-06-01T00:00:00.000Z',
      ownerPaidAt: '2026-09-01T00:00:00.000Z',
    });
    expect(input.teams[0].subscription?.plan).toBe('manager');
  });
});
