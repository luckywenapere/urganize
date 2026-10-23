import { beforeEach, describe, expect, it, vi } from 'vitest';

const approveUser = vi.fn(async () => true);
vi.mock('@/lib/access-gate-server', () => ({ approveUser: (...a: unknown[]) => approveUser(...(a as [])) }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(), isEmailConfigured: () => false }));

import { recordFriend } from './waitlist-share-server';

type Row = Record<string, unknown>;

// A tiny in-memory stand-in for the three tables recordFriend touches.
function fakeAdmin(state: { codes: Row[]; referrals: Row[]; profiles: Row[] }) {
  return {
    from(table: string) {
      const rows = table === 'waitlist_share_codes' ? state.codes : table === 'waitlist_referrals' ? state.referrals : state.profiles;
      const filters: Array<[string, unknown]> = [];
      const q: Record<string, unknown> = {
        select: (_cols?: string, opts?: { head?: boolean }) => {
          q.head = opts?.head;
          return q;
        },
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return q;
        },
        maybeSingle: async () => ({
          data: rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null,
          error: null,
        }),
        insert: async (row: Row) => {
          if (rows.some((r) => r.referred_id === row.referred_id)) return { error: { code: '23505' } };
          rows.push(row);
          return { error: null };
        },
        then: (resolve: (v: unknown) => void) =>
          resolve({ count: rows.filter((r) => filters.every(([c, v]) => r[c] === v)).length, error: null }),
      };
      return q;
    },
  } as never;
}

const CODE = 'ABCDEFGH';

function setup(extra: Partial<{ referred: Row[] }> = {}) {
  const state = {
    codes: [{ user_id: 'sharer', code: CODE }],
    referrals: [] as Row[],
    profiles: [{ id: 'f1', access_approved_at: null }, { id: 'f2', access_approved_at: null }, { id: 'f3', access_approved_at: null }, { id: 'in', access_approved_at: '2026-10-01' }, ...(extra.referred ?? [])],
  };
  return state;
}

describe('recordFriend', () => {
  beforeEach(() => approveUser.mockClear());

  it('lets the sharer in at exactly the third friend, not before', async () => {
    const state = setup();
    const admin = fakeAdmin(state);
    expect(await recordFriend(admin, 'f1', CODE)).toBe('counted');
    expect(await recordFriend(admin, 'f2', CODE)).toBe('counted');
    expect(approveUser).not.toHaveBeenCalled();
    expect(await recordFriend(admin, 'f3', CODE)).toBe('counted');
    expect(approveUser).toHaveBeenCalledWith(admin, 'sharer', 'friends');
  });

  it('counts a friend once, ever', async () => {
    const state = setup();
    const admin = fakeAdmin(state);
    await recordFriend(admin, 'f1', CODE);
    expect(await recordFriend(admin, 'f1', CODE)).toBe('ignored');
    expect(state.referrals).toHaveLength(1);
  });

  it('ignores the sharer, an account already let in, junk and unknown codes', async () => {
    const state = setup();
    const admin = fakeAdmin(state);
    expect(await recordFriend(admin, 'sharer', CODE)).toBe('ignored');
    expect(await recordFriend(admin, 'in', CODE)).toBe('ignored');
    expect(await recordFriend(admin, 'f1', 'nope')).toBe('ignored');
    expect(await recordFriend(admin, 'f1', 'ZZZZZZZZ')).toBe('ignored');
    expect(await recordFriend(admin, 'f1', undefined)).toBe('ignored');
    expect(state.referrals).toHaveLength(0);
  });

  it('matches a lower case code', async () => {
    const state = setup();
    expect(await recordFriend(fakeAdmin(state), 'f1', CODE.toLowerCase())).toBe('counted');
  });
});
