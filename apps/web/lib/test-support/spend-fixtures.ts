import { makeFakeSupabase, type FakeDb, type FakeOptions } from './fake-supabase';

/**
 * Shared set-up for the release spend route tests. The `vi.mock` calls cannot
 * live here (vitest hoists them per test file), so each route test mocks auth
 * and the team-access helper itself and uses these for the data and the fake
 * database. Test code only.
 */

export const REL = '11111111-1111-4111-8111-111111111111';
export const OTHER_REL = '22222222-2222-4222-8222-222222222222';
export const TASK_OK = '33333333-3333-4333-8333-333333333333';
export const TASK_OTHER = '44444444-4444-4444-8444-444444444444';

export const OWNER = 'user-owner';
export const MANAGER = 'user-manager';
export const MEMBER = 'user-member';

export function spendRow(over: Record<string, unknown> = {}) {
  return {
    id: 'line-1',
    release_id: REL,
    category: 'promo',
    amount_kobo: 5_000_000,
    paid_to: 'DJ Spinall',
    spent_on: '2026-10-01',
    task_id: null,
    source: 'manual',
    note: null,
    created_at: '2026-10-01T10:00:00Z',
    ...over,
  };
}

export function spendDb(over: FakeDb = {}): FakeDb {
  return {
    release_spend: [],
    release_payback: [],
    tasks: [
      { id: TASK_OK, release_id: REL },
      { id: TASK_OTHER, release_id: OTHER_REL },
    ],
    workspaces: [{ id: 'ws-1', owner_id: OWNER }],
    ...over,
  };
}

/** The visibility rule as the database function would answer it: the owner and a
 *  manager of this rollout may see it, a plain member may not. */
export const DEFAULT_VIEWERS: Record<string, string[]> = {
  [OWNER]: [REL, OTHER_REL],
  [MANAGER]: [REL],
  [MEMBER]: [],
};

export function viewersRpc(viewers: Record<string, string[]> = DEFAULT_VIEWERS) {
  return (args: { p_release_id: string; p_user_id: string }) =>
    (viewers[args.p_user_id] ?? []).includes(args.p_release_id);
}

export function makeSpendFake(db: FakeDb, options: FakeOptions = {}) {
  return makeFakeSupabase(db, {
    rpc: { can_view_release_spend: viewersRpc() },
    ...options,
  });
}
