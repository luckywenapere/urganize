import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/team-billing-server', () => ({ invalidateTeamAccess: vi.fn() }));

import {
  clearAccessApprovalCache,
  escapeLike,
  generateAccessCode,
  getAppAccess,
  hashAccessCode,
  redeemAccessCode,
} from './access-gate-server';

// A tiny chainable stand-in for the supabase query builder. Each table answers
// from a script; updates are recorded.
type Script = Record<string, (filters: Record<string, unknown>, op: string) => { data: unknown; error: unknown }>;

function fakeClient(script: Script) {
  const updates: Array<{ table: string; values: unknown; filters: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let op = 'select';
      let values: unknown = null;
      const run = () => {
        if (op === 'update') updates.push({ table, values, filters: { ...filters } });
        return (script[table] || (() => ({ data: null, error: null })))(filters, op);
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        update: (v: unknown) => {
          op = 'update';
          values = v;
          return builder;
        },
        eq: (k: string, v: unknown) => ((filters[`eq:${k}`] = v), builder),
        neq: (k: string, v: unknown) => ((filters[`neq:${k}`] = v), builder),
        is: (k: string, v: unknown) => ((filters[`is:${k}`] = v), builder),
        in: (k: string, v: unknown) => ((filters[`in:${k}`] = v), builder),
        ilike: (k: string, v: unknown) => ((filters[`ilike:${k}`] = v), builder),
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve(run()),
        then: (resolve: (value: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(run()).then(resolve, reject),
      };
      return builder;
    },
  };
  return { client: client as never, updates };
}

beforeEach(() => clearAccessApprovalCache());

describe('getAppAccess', () => {
  it('lets in an approved profile', async () => {
    const { client } = fakeClient({ profiles: () => ({ data: { access_approved_at: '2026-10-01', email: 'a@b.co' }, error: null }) });
    expect(await getAppAccess('u1', 'a@b.co', client)).toEqual({ allowed: true });
  });

  it('holds a new account with no invite of any kind', async () => {
    const { client, updates } = fakeClient({
      profiles: () => ({ data: { access_approved_at: null, email: 'new@b.co' }, error: null }),
      workspace_members: () => ({ data: [], error: null }),
      access_invites: () => ({ data: null, error: null }),
    });
    expect(await getAppAccess('u2', 'new@b.co', client)).toEqual({ allowed: false });
    expect(updates).toHaveLength(0);
  });

  it('never caches a no: the request after "Let in" goes through', async () => {
    let approved = false;
    const { client } = fakeClient({
      profiles: () => ({ data: { access_approved_at: approved ? 'now' : null, email: 'x@b.co' }, error: null }),
      workspace_members: () => ({ data: [], error: null }),
      access_invites: () => ({ data: null, error: null }),
    });
    expect((await getAppAccess('u3', 'x@b.co', client)).allowed).toBe(false);
    approved = true;
    expect((await getAppAccess('u3', 'x@b.co', client)).allowed).toBe(true);
  });

  it('lets in a teammate of a team they do not own, and stamps it', async () => {
    const { client, updates } = fakeClient({
      profiles: (_f, op) => (op === 'update' ? { data: null, error: null } : { data: { access_approved_at: null, email: 't@b.co' }, error: null }),
      workspace_members: () => ({ data: [{ workspace_id: 'w1' }], error: null }),
      workspaces: () => ({ data: [{ id: 'w1', owner_id: 'someone-else' }], error: null }),
      access_invites: () => ({ data: null, error: null }),
    });
    expect((await getAppAccess('u4', 't@b.co', client)).allowed).toBe(true);
    expect(updates.find((u) => u.table === 'profiles')?.values).toMatchObject({ access_source: 'team_invite' });
  });

  it('does not count their own team as an invite', async () => {
    const { client } = fakeClient({
      profiles: () => ({ data: { access_approved_at: null, email: 'o@b.co' }, error: null }),
      workspace_members: () => ({ data: [{ workspace_id: 'w1' }], error: null }),
      workspaces: () => ({ data: [{ id: 'w1', owner_id: 'u5' }], error: null }),
      access_invites: () => ({ data: null, error: null }),
    });
    expect((await getAppAccess('u5', 'o@b.co', client)).allowed).toBe(false);
  });

  it('claims an open founder invite bound to their email', async () => {
    const { client, updates } = fakeClient({
      profiles: (_f, op) => (op === 'update' ? { data: null, error: null } : { data: { access_approved_at: null, email: 'f@b.co' }, error: null }),
      workspace_members: () => ({ data: [], error: null }),
      access_invites: (_f, op) =>
        op === 'update' ? { data: [{ id: 'i1' }], error: null } : { data: { id: 'i1', used_at: null, revoked_at: null }, error: null },
    });
    expect((await getAppAccess('u6', 'F@b.co', client)).allowed).toBe(true);
    expect(updates.find((u) => u.table === 'access_invites')?.values).toMatchObject({ used_by: 'u6' });
    expect(updates.find((u) => u.table === 'profiles')?.values).toMatchObject({ access_source: 'invite_email' });
  });

  it('fails open on a read error (a blip or an unapplied migration)', async () => {
    const { client } = fakeClient({ profiles: () => ({ data: null, error: { message: 'column does not exist' } }) });
    expect(await getAppAccess('u7', 'z@b.co', client)).toEqual({ allowed: true, reason: 'read_error' });
  });

  it('lets in the paywall allowlist before any read', async () => {
    expect((await getAppAccess('u8', 'luckydio10@gmail.com', null)).allowed).toBe(true);
  });
});

describe('redeemAccessCode', () => {
  const code = 'AbCdEfGh23456789';
  const future = '2099-01-01T00:00:00Z';

  it('approves once and locks the row', async () => {
    const { client, updates } = fakeClient({
      access_invites: (f, op) =>
        op === 'update'
          ? { data: [{ id: 'r1' }], error: null }
          : f['eq:code_hash'] === hashAccessCode(code)
            ? { data: { id: 'r1', expires_at: future, revoked_at: null, used_at: null, used_by: null }, error: null }
            : { data: null, error: null },
      profiles: () => ({ data: null, error: null }),
    });
    expect(await redeemAccessCode(client, 'u1', code)).toBe('approved');
    const lock = updates.find((u) => u.table === 'access_invites');
    expect(lock?.filters).toMatchObject({ 'is:used_at': null, 'is:revoked_at': null });
    expect(updates.find((u) => u.table === 'profiles')?.values).toMatchObject({ access_source: 'invite_link' });
  });

  it('loses the race gracefully', async () => {
    const { client } = fakeClient({
      access_invites: (_f, op) =>
        op === 'update'
          ? { data: [], error: null }
          : { data: { id: 'r1', expires_at: future, revoked_at: null, used_at: null, used_by: null }, error: null },
    });
    expect(await redeemAccessCode(client, 'u2', code)).toBe('used');
  });

  it('answers used, expired, revoked and invalid', async () => {
    const row = (extra: Record<string, unknown>) =>
      fakeClient({ access_invites: () => ({ data: { id: 'r', expires_at: future, revoked_at: null, used_at: null, used_by: null, ...extra }, error: null }) }).client;
    expect(await redeemAccessCode(row({ used_at: 'x', used_by: 'other' }), 'u3', code)).toBe('used');
    expect(await redeemAccessCode(row({ expires_at: '2020-01-01T00:00:00Z' }), 'u3', code)).toBe('expired');
    expect(await redeemAccessCode(row({ revoked_at: 'x' }), 'u3', code)).toBe('revoked');
    expect(await redeemAccessCode(fakeClient({}).client, 'u3', code)).toBe('invalid');
    expect(await redeemAccessCode(fakeClient({}).client, 'u3', 'bad code')).toBe('invalid');
  });

  it('is idempotent for the account that used it', async () => {
    const { client } = fakeClient({
      access_invites: () => ({ data: { id: 'r', expires_at: future, revoked_at: null, used_at: 'x', used_by: 'u4' }, error: null }),
      profiles: () => ({ data: null, error: null }),
    });
    expect(await redeemAccessCode(client, 'u4', code)).toBe('approved');
  });
});

describe('codes and patterns', () => {
  it('are 16 unambiguous characters and hash to sha256 hex', () => {
    expect(generateAccessCode()).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/);
    expect(hashAccessCode('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('escapes LIKE wildcards in an email', () => {
    expect(escapeLike('first_last%x@b.co')).toBe('first\\_last\\%x@b.co');
  });
});
