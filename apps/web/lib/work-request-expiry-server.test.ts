import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { makeFakeSupabase, type FakeDb } from './test-support/fake-supabase';
import {
  expireStaleRequestsForPair,
  runWorkRequestExpirySweep,
} from './work-request-expiry-server';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

const row = (over: Record<string, unknown>) => ({
  id: 'r',
  status: 'new',
  workspace_id: 'team-1',
  recipient_user_id: 'u1',
  role: 'producer',
  created_at: daysAgo(1),
  ...over,
});

const db = (rows: Record<string, unknown>[]): FakeDb => ({ work_requests: rows });
const client = (data: FakeDb, options?: Parameters<typeof makeFakeSupabase>[1]) =>
  makeFakeSupabase(data, options).client as unknown as SupabaseClient;

describe('runWorkRequestExpirySweep', () => {
  it('closes waiting requests older than seven days and counts them', async () => {
    const data = db([
      row({ id: 'old-1', created_at: daysAgo(8) }),
      row({ id: 'old-2', created_at: daysAgo(30) }),
      row({ id: 'fresh', created_at: daysAgo(2) }),
    ]);
    const result = await runWorkRequestExpirySweep(client(data), NOW);
    expect(result).toEqual({ expired: 2 });
    const status = Object.fromEntries(data.work_requests.map((r) => [r.id, r.status]));
    expect(status).toEqual({ 'old-1': 'expired', 'old-2': 'expired', fresh: 'new' });
  });

  it('never touches an answered request, however old', async () => {
    const data = db([
      row({ id: 'yes', status: 'interested', created_at: daysAgo(60) }),
      row({ id: 'no', status: 'passed', created_at: daysAgo(60) }),
    ]);
    const result = await runWorkRequestExpirySweep(client(data), NOW);
    expect(result).toEqual({ expired: 0 });
    expect(data.work_requests.map((r) => r.status)).toEqual(['interested', 'passed']);
  });

  it('leaves a request made exactly seven days ago open', async () => {
    const data = db([row({ id: 'edge', created_at: daysAgo(7) })]);
    const result = await runWorkRequestExpirySweep(client(data), NOW);
    expect(result).toEqual({ expired: 0 });
    expect(data.work_requests[0].status).toBe('new');
  });

  it('closes nothing and reports why when the write is refused', async () => {
    // Most likely the migration that allows `expired` has not been applied.
    const data = db([row({ id: 'old', created_at: daysAgo(9) })]);
    const result = await runWorkRequestExpirySweep(client(data, { failWriteOn: ['work_requests'] }), NOW);
    expect(result).toMatchObject({ expired: 0 });
    expect(result.error).toBeTruthy();
    expect(data.work_requests[0].status).toBe('new');
  });

  it('never throws, even when the client itself throws', async () => {
    const broken = {
      from() {
        throw new Error('boom');
      },
    } as unknown as SupabaseClient;
    await expect(runWorkRequestExpirySweep(broken, NOW)).resolves.toMatchObject({ expired: 0 });
  });
});

describe('expireStaleRequestsForPair', () => {
  const pair = { workspaceId: 'team-1', recipientUserId: 'u1', role: 'producer' as const };

  it('closes only the stale request for that team, person and role', async () => {
    const data = db([
      row({ id: 'target', created_at: daysAgo(8) }),
      row({ id: 'other-person', recipient_user_id: 'u2', created_at: daysAgo(8) }),
      row({ id: 'other-role', role: 'pr', created_at: daysAgo(8) }),
      row({ id: 'other-team', workspace_id: 'team-2', created_at: daysAgo(8) }),
    ]);
    await expireStaleRequestsForPair(client(data), pair, NOW);
    const status = Object.fromEntries(data.work_requests.map((r) => [r.id, r.status]));
    expect(status).toEqual({
      target: 'expired',
      'other-person': 'new',
      'other-role': 'new',
      'other-team': 'new',
    });
  });

  it('leaves a request still inside its seven days, so the guard still holds', async () => {
    const data = db([row({ id: 'live', created_at: daysAgo(3) })]);
    await expireStaleRequestsForPair(client(data), pair, NOW);
    expect(data.work_requests[0].status).toBe('new');
  });

  it('does nothing without a team to scope to', async () => {
    const data = db([row({ id: 'old', created_at: daysAgo(9) })]);
    await expireStaleRequestsForPair(client(data), { ...pair, workspaceId: null }, NOW);
    expect(data.work_requests[0].status).toBe('new');
  });

  it('swallows a refused write, because the insert will say the real thing', async () => {
    const data = db([row({ id: 'old', created_at: daysAgo(9) })]);
    await expect(
      expireStaleRequestsForPair(client(data, { failWriteOn: ['work_requests'] }), pair, NOW)
    ).resolves.toBeUndefined();
  });
});
