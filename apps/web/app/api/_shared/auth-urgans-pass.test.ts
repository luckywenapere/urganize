import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// The paywall gate and the UrgAns pass. The pass skips ONE thing, the paywall
// check, for the user it was minted for. Everything else the gate does (the token
// check, the curator block) must still happen, and a request with no pass, a pass
// for someone else or an expired one must still meet the paywall.

const gate = vi.hoisted(() => ({ calls: 0, answer: null as unknown }));
vi.mock('@/app/api/_shared/paywall', () => ({
  requireActiveAccount: async () => {
    gate.calls += 1;
    return gate.answer;
  },
}));

const roles = vi.hoisted(() => ({ role: 'artist-manager' as string | null }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) =>
    key === 'service-key'
      ? { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: roles.role }, error: null }) }) }) }) }
      : { auth: { getUser: async (token: string) => (token === 'good' ? { data: { user: { id: 'user-1', email: 'a@b.test' } }, error: null } : { data: { user: null }, error: { message: 'bad' } }) } },
}));

import { requireActiveAuthenticatedUser } from './auth';
import { URGANS_PASS_HEADER } from '@/lib/urgans-pass-header';
import { mintPassForUser } from '@/lib/urgans-pass-server';

const walled = () => NextResponse.json({ code: 'ACCESS_REQUIRED' }, { status: 402 });

const request = (headers: Record<string, string> = {}, method = 'POST') =>
  new NextRequest('https://app.test/api/tasks', {
    method,
    headers: { authorization: 'Bearer good', ...headers },
  });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  gate.calls = 0;
  gate.answer = walled();
  roles.role = 'artist-manager';
});
afterEach(() => vi.unstubAllEnvs());

describe('without a pass', () => {
  it('meets the paywall exactly as before', async () => {
    const result = await requireActiveAuthenticatedUser(request());
    expect(gate.calls).toBe(1);
    expect('error' in result && result.error?.status).toBe(402);
  });

  it('lets a team the paywall admits through, as before', async () => {
    gate.answer = null;
    const result = await requireActiveAuthenticatedUser(request());
    expect(gate.calls).toBe(1);
    expect(result).toMatchObject({ user: { id: 'user-1' } });
  });
});

describe('with a live pass for this user', () => {
  it('skips the paywall check and nothing else', async () => {
    const result = await requireActiveAuthenticatedUser(request({ [URGANS_PASS_HEADER]: mintPassForUser('user-1') }));
    expect(gate.calls).toBe(0);
    expect(result).toMatchObject({ user: { id: 'user-1' }, supabaseUrl: 'https://supabase.test' });
    expect('error' in result && result.error).toBeFalsy();
  });

  it('works for a read-only team on a write too, which is the point', async () => {
    const result = await requireActiveAuthenticatedUser(
      request({ [URGANS_PASS_HEADER]: mintPassForUser('user-1') }, 'PATCH')
    );
    expect(gate.calls).toBe(0);
    expect(result).toMatchObject({ user: { id: 'user-1' } });
  });

  it('still needs a real token: a pass alone gets nothing', async () => {
    const result = await requireActiveAuthenticatedUser(
      request({ authorization: 'Bearer forged', [URGANS_PASS_HEADER]: mintPassForUser('user-1') })
    );
    expect('error' in result && result.error?.status).toBe(401);
    expect(gate.calls).toBe(0);

    const none = await requireActiveAuthenticatedUser(
      new NextRequest('https://app.test/api/tasks', { method: 'POST', headers: { [URGANS_PASS_HEADER]: mintPassForUser('user-1') } })
    );
    expect('error' in none && none.error?.status).toBe(401);
  });

  it('still blocks a curator-only account', async () => {
    roles.role = 'curator';
    const result = await requireActiveAuthenticatedUser(request({ [URGANS_PASS_HEADER]: mintPassForUser('user-1') }));
    expect('error' in result && result.error?.status).toBe(403);
  });
});

describe('with a pass that is not good for this request', () => {
  it('meets the paywall when the pass was minted for somebody else', async () => {
    const result = await requireActiveAuthenticatedUser(request({ [URGANS_PASS_HEADER]: mintPassForUser('user-2') }));
    expect(gate.calls).toBe(1);
    expect('error' in result && result.error?.status).toBe(402);
  });

  it('meets the paywall when the pass is expired, malformed or forged', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
      const old = mintPassForUser('user-1');
      vi.setSystemTime(new Date('2026-10-02T10:10:00Z'));
      for (const value of [old, 'garbage', '123.abc', '']) {
        gate.calls = 0;
        const result = await requireActiveAuthenticatedUser(request({ [URGANS_PASS_HEADER]: value }));
        expect(gate.calls, value).toBe(1);
        expect('error' in result && result.error?.status, value).toBe(402);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
