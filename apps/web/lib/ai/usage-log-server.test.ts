import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { recordAiUsage, recordRequestUsage, resetUsageLogWarnings } from './usage-log-server';
import type { UsageEventRow } from './usage-log';

type Upsert = (rows: unknown, options: unknown) => Promise<{ error: { code?: string; message?: string } | null }>;

function fakeClient(upsert: Upsert) {
  const calls: Array<{ table: string; rows: unknown; options: unknown }> = [];
  const client = {
    from: (table: string) => ({
      upsert: (rows: unknown, options: unknown) => {
        calls.push({ table, rows, options });
        return upsert(rows, options);
      },
    }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

const row = (over: Partial<UsageEventRow> = {}): UsageEventRow => ({
  request_id: 'req-1',
  call_index: 0,
  workspace_id: null,
  owner_user_id: null,
  actor_user_id: null,
  release_id: null,
  feature: 'chat',
  model: 'openai/gpt-4o-mini',
  status: 'ok',
  failure_kind: null,
  tokens_in: 100,
  tokens_out: 20,
  tokens_cached: 0,
  cost_rodi: 0.2,
  cost_assumed: false,
  credits_charged: 1,
  ...over,
});

beforeEach(() => {
  resetUsageLogWarnings();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('recordAiUsage', () => {
  it('writes to ai_usage_events and ignores a row it already holds, so recording twice records once', async () => {
    const { client, calls } = fakeClient(async () => ({ error: null }));
    await recordAiUsage(client, [row()]);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('ai_usage_events');
    expect(calls[0].options).toEqual({ onConflict: 'request_id,call_index', ignoreDuplicates: true });
  });

  it('writes nothing for no rows', async () => {
    const { client, calls } = fakeClient(async () => ({ error: null }));
    await recordAiUsage(client, []);
    expect(calls).toHaveLength(0);
  });

  it('never throws when the database answers with an error', async () => {
    const { client } = fakeClient(async () => ({ error: { code: '23514', message: 'check violation' } }));
    await expect(recordAiUsage(client, [row()])).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('never throws when the call itself throws', async () => {
    const { client } = fakeClient(async () => {
      throw new Error('network down');
    });
    await expect(recordAiUsage(client, [row()])).resolves.toBeUndefined();
  });

  it('says once, and quietly, that the table is missing, then stays silent', async () => {
    const { client } = fakeClient(async () => ({ error: { code: '42P01', message: 'relation does not exist' } }));
    await recordAiUsage(client, [row()]);
    await recordAiUsage(client, [row({ call_index: 1 })]);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('treats the schema-cache miss the same way as a missing table', async () => {
    const { client } = fakeClient(async () => ({ error: { code: 'PGRST205', message: 'not found in schema cache' } }));
    await recordAiUsage(client, [row()]);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('recordRequestUsage', () => {
  it('builds the rows from a request and writes them', async () => {
    const { client, calls } = fakeClient(async () => ({ error: null }));
    await recordRequestUsage(client, {
      context: { requestId: 'req-9', feature: 'plan', workspaceId: null, ownerUserId: null, actorUserId: null, releaseId: null },
      calls: [{ model: 'openai/gpt-5.4', promptTokens: 1000, completionTokens: 300, cachedTokens: 0 }],
      failures: [{ model: 'openai/gpt-5.4', kind: 'timeout' }],
      creditsCharged: 12,
    });
    const rows = calls[0].rows as UsageEventRow[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ request_id: 'req-9', feature: 'plan', credits_charged: 12, status: 'ok' });
    expect(rows[1]).toMatchObject({ status: 'failed', failure_kind: 'timeout' });
  });

  it('writes nothing for a request that made no calls', async () => {
    const { client, calls } = fakeClient(async () => ({ error: null }));
    await recordRequestUsage(client, {
      context: { requestId: 'r', feature: 'chat', workspaceId: null, ownerUserId: null, actorUserId: null, releaseId: null },
      calls: [],
      failures: [],
      creditsCharged: 0,
    });
    expect(calls).toHaveLength(0);
  });
});
