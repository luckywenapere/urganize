import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RODI_PER_USD } from './credits/pricing';
import { loadUsageMetrics } from './usage-metrics-server';

// The reads behind /admin/metrics, driven against an in-memory stand-in for
// Supabase (the scoreboard-server test's fake, plus auth.admin.listUsers). It
// honours paging, `in` on ids and a missing table, and ignores the other
// filters, which the counting rules in usage-metrics.test.ts already cover.

const NOW = new Date('2026-10-07T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

type Tables = Record<string, Array<Record<string, unknown>> | 'missing'>;
type AuthUser = { id: string; email: string; last_sign_in_at?: string; created_at?: string };

function fakeClient(tables: Tables, authUsers: AuthUser[] | 'error' = []): SupabaseClient {
  return {
    auth: {
      admin: {
        listUsers: async ({ page, perPage }: { page: number; perPage: number }) => {
          if (authUsers === 'error') return { data: { users: [] }, error: { message: 'admin api down' } };
          const start = (page - 1) * perPage;
          return { data: { users: authUsers.slice(start, start + perPage) }, error: null };
        },
      },
    },
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

const workspace = (id: string, owner: string) => ({
  id,
  owner_id: owner,
  name: `${id} team`,
  created_at: '2026-06-01T00:00:00.000Z',
  trial_started_at: null,
  trial_ends_at: null,
  comped_at: null,
  billing_plan: null,
  billing_locked_amount: null,
});

const releaseRow = (id: string, owner: string, over: Record<string, unknown> = {}) => ({
  id,
  owner_user_id: owner,
  artist_id: 'artist-1',
  created_at: ago(2 * DAY),
  updated_at: ago(2 * DAY),
  release_date: '2026-11-01',
  status: 'draft',
  metadata: {},
  ...over,
});

const options = (over: Partial<{ hiddenEmails: Set<string>; waitlistTotal: number | null }> = {}) => ({
  hiddenEmails: new Set<string>(),
  waitlistTotal: null,
  ...over,
});

describe('loadUsageMetrics', () => {
  it('builds the page from presence, accounts, rollouts and plan drafts', async () => {
    const client = fakeClient(
      {
        workspaces: [workspace('team', 'ada')],
        artists: [{ id: 'artist-1', workspace_id: 'team' }],
        releases: [
          releaseRow('r1', 'ada'),
          releaseRow('r2', 'ada', { metadata: { test_release: true } }),
        ],
        tasks: [
          { id: 't1', release_id: 'r1', status: 'done', completed_at: ago(DAY), updated_at: ago(DAY), auto_generated: true, created_at: ago(2 * DAY) },
        ],
        release_plan_drafts: [{ release_id: 'r1', applied: 'true' }],
        user_presence_days: [
          { user_id: 'ada', day: '2026-10-07', last_seen_at: ago(60 * 1000), surface: 'phone_web' },
        ],
        profiles: [{ id: 'ada', name: 'Ada', email: 'ada@example.com', role: 'manager', created_at: '2026-06-01T00:00:00.000Z', onboarding_completed: true }],
      },
      [{ id: 'ada', email: 'ada@example.com', created_at: '2026-06-01T00:00:00.000Z' }]
    );
    const { metrics } = await loadUsageMetrics(client, NOW, options({ waitlistTotal: 104 }));
    expect(metrics.online.map((person) => person.name)).toEqual(['Ada']);
    expect(metrics.online[0]).toMatchObject({ surface: 'phone_web', team: 'team team' });
    expect(metrics.rollouts).toMatchObject({ total: 1, tests: 1 });
    expect(metrics.rollouts.plans.urgans).toBe(1);
    expect(metrics.work.activitiesDone7d).toBe(1);
    expect(metrics.accounts).toMatchObject({ total: 1, waitlist: 104 });
    expect(metrics.presenceSince).toBe('2026-10-07');
  });

  it('counts someone who only opened the app, from the login-ping rows', async () => {
    const client = fakeClient(
      { scheduled_notifications: [{ user_id: 'ben', created_at: ago(3 * DAY) }] },
      [{ id: 'ben', email: 'ben@example.com' }]
    );
    const { metrics } = await loadUsageMetrics(client, NOW, options());
    expect(metrics.active.last7d).toBe(1);
    expect(metrics.recent[0]).toMatchObject({ userId: 'ben', lastThing: 'opened the app' });
  });

  it('hides our team by email, whatever the case', async () => {
    const client = fakeClient(
      { releases: [releaseRow('r1', 'founder')] },
      [
        { id: 'founder', email: 'Founder@Example.com', last_sign_in_at: ago(DAY) },
        { id: 'ada', email: 'ada@example.com', last_sign_in_at: ago(DAY) },
      ]
    );
    const { metrics, hiddenEmails } = await loadUsageMetrics(
      client,
      NOW,
      options({ hiddenEmails: new Set(['founder@example.com']) })
    );
    expect(hiddenEmails).toEqual(['founder@example.com']);
    expect(metrics.recent.map((person) => person.userId)).toEqual(['ada']);
    expect(metrics.rollouts.total).toBe(0);
  });

  it('reads AI cost from the usage log, in dollars', async () => {
    const client = fakeClient({
      ai_usage_events: [{ actor_user_id: 'ada', owner_user_id: 'ada', created_at: ago(DAY), cost_rodi: RODI_PER_USD * 2 }],
    });
    const { metrics } = await loadUsageMetrics(client, NOW, options());
    expect(metrics.work.aiCostUsd30d).toBeCloseTo(2);
    expect(metrics.work.aiCostSource).toBe('AI usage log');
  });

  it('falls back to the credit ledger when the usage log is missing', async () => {
    const client = fakeClient({
      ai_usage_events: 'missing',
      credit_ledger: [{ actor_user_id: 'ada', owner_user_id: 'ada', created_at: ago(DAY), provider_cost_rodi: String(RODI_PER_USD) }],
    });
    const { metrics, sources } = await loadUsageMetrics(client, NOW, options());
    expect(metrics.work.aiCostUsd30d).toBeCloseTo(1);
    expect(metrics.work.aiCostSource).toBe('credit ledger');
    expect(sources.find((source) => source.table === 'ai_usage_events')?.status).toBe('missing');
  });

  it('says not tracked, never zero, when neither cost source can be read', async () => {
    const client = fakeClient({ ai_usage_events: 'missing', credit_ledger: 'missing' });
    const { metrics } = await loadUsageMetrics(client, NOW, options());
    expect(metrics.work.aiCostUsd30d).toBeNull();
  });

  it('still builds when the presence table does not exist yet', async () => {
    const client = fakeClient(
      { user_presence_days: 'missing' },
      [{ id: 'ada', email: 'ada@example.com', last_sign_in_at: ago(DAY) }]
    );
    const { metrics, sources } = await loadUsageMetrics(client, NOW, options());
    expect(sources.find((source) => source.table === 'user_presence_days')?.status).toBe('missing');
    expect(metrics.presenceSince).toBeNull();
    expect(metrics.online).toEqual([]);
    expect(metrics.active.last7d).toBe(1);
  });

  it('still counts accounts from profiles when the auth admin API fails', async () => {
    const client = fakeClient(
      { profiles: [{ id: 'ada', name: 'Ada', email: 'ada@example.com', role: 'manager', created_at: ago(DAY), onboarding_completed: false }] },
      'error'
    );
    const { metrics, sources } = await loadUsageMetrics(client, NOW, options());
    expect(metrics.accounts.total).toBe(1);
    expect(sources.find((source) => source.table === 'auth.users')?.status).toBe('error');
  });
});
