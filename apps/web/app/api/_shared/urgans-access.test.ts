import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// The UrgAns gate: the normal paywalled gate plus the credits-only admission. The
// invariant that matters most is the boring one: everyone the normal gate lets in
// comes back exactly as before, and only a PAYWALL refusal for a credits-only
// team is ever admitted.

const normal = vi.hoisted(() => ({
  result: null as unknown,
}));
const direct = vi.hoisted(() => ({
  auth: { user: { id: 'user-1', email: 'a@b.test' }, supabaseUrl: 'https://supabase.test' } as unknown,
  curator: null as unknown,
}));
const team = vi.hoisted(() => ({
  value: { state: 'walled', tier: 'label', primaryWorkspaceId: 'ws-1', ownerUserId: 'owner-1' } as Record<string, unknown>,
}));
const balances = vi.hoisted(() => ({ value: { trial: 0, allowance: 0, topup: 40, total: 40 } as unknown }));
const adminClient = { marker: 'admin' };
const calls = vi.hoisted(() => ({ team: 0, balances: 0 }));

vi.mock('@/app/api/_shared/auth', () => ({
  requireAuthenticatedAdmin: async () => normal.result,
  getAuthenticatedUser: async () => direct.auth,
  blockCuratorAccount: async () => direct.curator,
  createAdminClient: () => adminClient,
}));
vi.mock('@/lib/team-billing-server', () => ({
  getTeamAccessForUser: async () => {
    calls.team += 1;
    return team.value;
  },
}));
vi.mock('@/lib/credits/credits-server', () => ({
  readBalances: async () => {
    calls.balances += 1;
    return balances.value;
  },
}));

import { requireUrgansAccess } from './urgans-access';

const request = () => new NextRequest('https://app.test/api/urgans', { method: 'POST', headers: { authorization: 'Bearer t' } });

const admitted = { user: { id: 'user-1', email: 'a@b.test' }, supabaseUrl: 'https://supabase.test', adminClient };
const refused = (status: number, body: Record<string, unknown> = {}) => ({ error: NextResponse.json(body, { status }) });
const paywall = () => refused(402, { code: 'ACCESS_REQUIRED', redirect: '/locked' });
const readOnly = () => refused(403, { code: 'READ_ONLY', readOnly: true });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_FEATURE_URGANS_CREDITS', 'true');
  normal.result = paywall();
  direct.auth = { user: { id: 'user-1', email: 'a@b.test' }, supabaseUrl: 'https://supabase.test' };
  direct.curator = null;
  team.value = { state: 'walled', tier: 'label', primaryWorkspaceId: 'ws-1', ownerUserId: 'owner-1' };
  balances.value = { trial: 0, allowance: 0, topup: 40, total: 40 };
  calls.team = 0;
  calls.balances = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe('everyone the normal gate admits', () => {
  it('comes back as before, flagged as not credits-only, with no extra reads', async () => {
    normal.result = admitted;
    const result = await requireUrgansAccess(request());
    expect(result).toMatchObject({ user: { id: 'user-1' }, supabaseUrl: 'https://supabase.test', adminClient, creditsOnly: null });
    expect(calls.team).toBe(0);
    expect(calls.balances).toBe(0);
  });
});

describe('a walled team', () => {
  it('is admitted with its team and a funded flag when it holds credits', async () => {
    const result = await requireUrgansAccess(request());
    expect(result).toMatchObject({
      user: { id: 'user-1' },
      adminClient,
      creditsOnly: { workspaceId: 'ws-1', ownerUserId: 'owner-1', funded: true },
    });
    expect('error' in result && result.error).toBeFalsy();
  });

  it('is still admitted with no credits, but not funded, so the assistant gets no pass', async () => {
    balances.value = { trial: 0, allowance: 0, topup: 0, total: 0 };
    expect(await requireUrgansAccess(request())).toMatchObject({ creditsOnly: { funded: false } });
  });

  it('counts an unreadable balance as funded, as every counter here fails open', async () => {
    balances.value = null;
    expect(await requireUrgansAccess(request())).toMatchObject({ creditsOnly: { funded: true } });
  });
});

describe('a read-only team', () => {
  it('is admitted on the read-only refusal', async () => {
    normal.result = readOnly();
    team.value = { state: 'read_only', tier: 'manager', primaryWorkspaceId: 'ws-1', ownerUserId: 'owner-1' };
    expect(await requireUrgansAccess(request())).toMatchObject({ creditsOnly: { workspaceId: 'ws-1', funded: true } });
  });
});

describe('what is NOT admitted', () => {
  const stillRefused = async (result: unknown, status: number) => {
    expect(result).toHaveProperty('error');
    expect((result as { error: NextResponse }).error.status).toBe(status);
  };

  it('nothing at all when credits are switched off', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_URGANS_CREDITS', '');
    await stillRefused(await requireUrgansAccess(request()), 402);
    expect(calls.team).toBe(0);
  });

  it('a bad token, a curator account, a missing server setting or a plain 403', async () => {
    for (const [result, status] of [
      [refused(401, { error: 'Unauthorized' }), 401],
      [refused(403, { error: 'This account is for playlist owners.' }), 403],
      [refused(403, { error: 'nope', code: 'SOMETHING_ELSE' }), 403],
      [refused(500, { error: 'Server environment is not configured' }), 500],
    ] as const) {
      normal.result = result;
      await stillRefused(await requireUrgansAccess(request()), status);
    }
    expect(calls.team).toBe(0);
  });

  it('a curator-only account, even when something upstream refused it for the paywall', async () => {
    direct.curator = NextResponse.json({ error: 'This account is for playlist owners.' }, { status: 403 });
    await stillRefused(await requireUrgansAccess(request()), 402);
    expect(calls.team).toBe(0);
  });

  it('a person with no team', async () => {
    team.value = { state: 'walled', primaryWorkspaceId: null, ownerUserId: null };
    await stillRefused(await requireUrgansAccess(request()), 402);
  });

  it('a team the credit rules do not call credits-only, whatever the gate said', async () => {
    for (const state of ['paid', 'comped', 'trial', 'grace']) {
      team.value = { state, tier: 'manager', primaryWorkspaceId: 'ws-1', ownerUserId: 'owner-1' };
      await stillRefused(await requireUrgansAccess(request()), 402);
    }
    expect(calls.balances).toBe(0);
  });

  it('a request whose token the second look cannot resolve', async () => {
    direct.auth = { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    await stillRefused(await requireUrgansAccess(request()), 402);
  });

  it('gives back the original refusal untouched, so the 402 still reaches the browser as it did', async () => {
    team.value = { state: 'paid', primaryWorkspaceId: 'ws-1', ownerUserId: 'o' };
    const result = (await requireUrgansAccess(request())) as { error: NextResponse };
    expect(result.error.status).toBe(402);
    expect(await result.error.json()).toMatchObject({ code: 'ACCESS_REQUIRED', redirect: '/locked' });
  });
});
