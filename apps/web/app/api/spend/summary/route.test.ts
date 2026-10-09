import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { FakeDb, FakeOptions } from '@/lib/test-support/fake-supabase';
import { OWNER, makeSpendFake, spendDb } from '@/lib/test-support/spend-fixtures';

// The Home card's numbers. The route has no access logic of its own: it asks the
// database function, for the signed-in user only.

let db: FakeDb;
let fakeOptions: FakeOptions;
let currentUser: string;
let authRefused: boolean;
let fake: ReturnType<typeof makeSpendFake>;

vi.mock('@/app/api/_shared/auth', () => ({
  requireActiveAuthenticatedUser: async () =>
    authRefused
      ? { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
      : { user: { id: currentUser, email: `${currentUser}@example.com` }, supabaseUrl: 'https://supabase.test' },
  createAdminClient: () => {
    fake = makeSpendFake(db, fakeOptions);
    return fake.client;
  },
}));

import { GET } from './route';

const get = (query = '') =>
  new NextRequest(`https://app.test/api/spend/summary${query}`, { headers: { Authorization: 'Bearer jwt' } });
const need = (response: Response | undefined): Response => {
  if (!response) throw new Error('The route returned no response.');
  return response;
};

const rows = [
  { category: 'promo', amount_kobo: 4_000_000, line_count: 2 },
  { category: 'design', amount_kobo: 9_000_000, line_count: 1 },
];

beforeEach(() => {
  db = spendDb();
  fakeOptions = { rpc: { release_spend_by_category: () => ({ data: rows, error: null }) } };
  currentUser = OWNER;
  authRefused = false;
});

describe('GET /api/spend/summary', () => {
  it('returns the categories, largest first, with a total', async () => {
    const response = need(await GET(get()));
    expect(response.status).toBe(200);
    const { summary } = await response.json();
    expect(summary.totalKobo).toBe(13_000_000);
    expect(summary.lineCount).toBe(3);
    expect(summary.categories.map((c: { category: string }) => c.category)).toEqual(['design', 'promo']);
    expect(summary.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('asks about the signed-in person only, whatever the request carries', async () => {
    await GET(get(`?userId=someone-else&p_user_id=someone-else`));
    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0].args.p_user_id).toBe(OWNER);
  });

  it('is an empty summary, not an error, when there is no spend', async () => {
    fakeOptions = { rpc: { release_spend_by_category: () => ({ data: [], error: null }) } };
    const { summary } = await need(await GET(get())).json();
    expect(summary).toMatchObject({ totalKobo: 0, lineCount: 0, categories: [] });
  });

  it('is a 500 when it cannot be read', async () => {
    fakeOptions = { rpc: {} };
    const response = need(await GET(get()));
    expect(response.status).toBe(500);
  });

  it('passes an auth refusal through untouched, and asks nothing', async () => {
    authRefused = true;
    const response = need(await GET(get()));
    expect(response.status).toBe(401);
  });
});
