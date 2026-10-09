import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { presenceDay } from '@/lib/presence';
import type { FakeDb, FakeOptions } from '@/lib/test-support/fake-supabase';
import {
  MANAGER,
  MEMBER,
  OTHER_REL,
  OWNER,
  REL,
  TASK_OK,
  TASK_OTHER,
  makeSpendFake,
  spendDb,
  spendRow,
} from '@/lib/test-support/spend-fixtures';

// The Spend section's list and add routes, driven against the real route, server
// module and rules with an in-memory database. Only auth and the team-access
// helper are stubbed, so the visibility rule, the validation and the refusals
// are tested through the route and not assumed.

let db: FakeDb;
let fakeOptions: FakeOptions;
let currentUser: string;
let readAccess: 'ok' | 'not_found';
let writeAccess: 'ok' | 'read_only' | 'not_found';
let fake: ReturnType<typeof makeSpendFake>;

vi.mock('@/app/api/_shared/auth', () => ({
  requireActiveAuthenticatedUser: async () => ({
    user: { id: currentUser, email: `${currentUser}@example.com` },
    supabaseUrl: 'https://supabase.test',
  }),
  createAdminClient: () => {
    fake = makeSpendFake(db, fakeOptions);
    return fake.client;
  },
}));

vi.mock('@/lib/release-access-server', () => ({
  ensureReleaseTeamReadAccess: async () =>
    readAccess === 'ok'
      ? { release: { id: 'rel', ownerUserId: 'user-owner' } }
      : { error: NextResponse.json({ error: 'Rollout not found.' }, { status: 404 }) },
  ensureReleaseTeamWriteAccess: async () =>
    writeAccess === 'ok'
      ? { release: { id: 'rel', ownerUserId: 'user-owner' } }
      : writeAccess === 'read_only'
        ? { error: NextResponse.json({ error: 'Your role in this team is view-only.' }, { status: 403 }) }
        : { error: NextResponse.json({ error: 'Rollout not found.' }, { status: 404 }) },
}));

import { GET, POST } from './route';

const context = { params: Promise.resolve({ releaseId: REL }) };
const need = (response: Response | undefined): Response => {
  if (!response) throw new Error('The route returned no response.');
  return response;
};

const get = () => new NextRequest(`https://app.test/api/releases/${REL}/spend`, { headers: { Authorization: 'Bearer jwt' } });
const post = (body: unknown, raw?: string) =>
  new NextRequest(`https://app.test/api/releases/${REL}/spend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt' },
    body: raw ?? JSON.stringify(body),
  });

const valid = { category: 'promo', amountNaira: '50,000', paidTo: 'DJ Spinall', spentOn: '2026-10-01' };
const spendWrites = () => fake.writes.filter((write) => write.table === 'release_spend');

beforeEach(() => {
  db = spendDb();
  fakeOptions = {};
  currentUser = OWNER;
  readAccess = 'ok';
  writeAccess = 'ok';
});

describe('GET', () => {
  it('gives a manager the lines newest first, the total and the payback', async () => {
    currentUser = MANAGER;
    db.release_spend = [
      spendRow({ id: 'a', spent_on: '2026-10-01', amount_kobo: 1_000_000 }),
      spendRow({ id: 'b', spent_on: '2026-10-05', amount_kobo: 250_050, source: 'urganize', category: 'other' }),
    ];
    db.release_payback = [{ release_id: REL, asked_at: 'x', amount_kobo: 30_000_000, note: null, answered_at: 'y' }];
    const response = need(await GET(get(), context));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.canView).toBe(true);
    expect(body.lines.map((line: { id: string }) => line.id)).toEqual(['b', 'a']);
    expect(body.totalKobo).toBe(1_250_050);
    expect(body.payback.amountKobo).toBe(30_000_000);
  });

  it('gives a team member without spend access a 200 that says so, and no lines', async () => {
    currentUser = MEMBER;
    db.release_spend = [spendRow()];
    const response = need(await GET(get(), context));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ canView: false, lines: [], totalKobo: 0, payback: null });
  });

  it('asks about the signed-in person, whatever the request says', async () => {
    currentUser = MEMBER;
    await GET(
      new NextRequest(`https://app.test/api/releases/${REL}/spend?userId=${OWNER}`, { headers: { Authorization: 'Bearer jwt' } }),
      context
    );
    expect(fake.rpcCalls).toEqual([{ name: 'can_view_release_spend', args: { p_release_id: REL, p_user_id: MEMBER } }]);
  });

  it('hides a rollout from somebody outside the team (404) without asking about spend', async () => {
    readAccess = 'not_found';
    const response = need(await GET(get(), context));
    expect(response.status).toBe(404);
    expect(fake.rpcCalls).toEqual([]);
  });

  it('is a 500, not an empty list, when the visibility rule cannot be checked', async () => {
    fakeOptions = { rpc: {} };
    const response = need(await GET(get(), context));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/could not load/i);
  });

  it('is a 500 when the lines cannot be read', async () => {
    fakeOptions = { failSelectOn: ['release_spend'] };
    expect(need(await GET(get(), context)).status).toBe(500);
  });
});

describe('POST', () => {
  it('adds a manual line, stamped with who added it and the owner\'s team', async () => {
    currentUser = MANAGER;
    const response = need(await POST(post(valid), context));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.line).toMatchObject({
      category: 'promo',
      amountKobo: 5_000_000,
      paidTo: 'DJ Spinall',
      spentOn: '2026-10-01',
      source: 'manual',
      isAutomatic: false,
    });
    expect(spendWrites()).toHaveLength(1);
    expect(spendWrites()[0].row).toMatchObject({
      release_id: REL,
      workspace_id: 'ws-1',
      amount_kobo: 5_000_000,
      source: 'manual',
      created_by: MANAGER,
    });
  });

  it('defaults the date to today in Lagos', async () => {
    const response = need(await POST(post({ category: 'design', amountNaira: 1000 }), context));
    expect(response.status).toBe(201);
    expect((await response.json()).line.spentOn).toBe(presenceDay(new Date()));
  });

  it('turns the naira a person typed into kobo once, here', async () => {
    const response = need(await POST(post({ ...valid, amountNaira: '₦1,234.50' }), context));
    expect((await response.json()).line.amountKobo).toBe(123_450);
  });

  it('refuses a bad line with a 400 that says what is wrong, and writes nothing', async () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ ...valid, category: 'merch' }, /what it was for/i],
      [{ ...valid, amountNaira: 0 }, /above ₦0/],
      [{ ...valid, amountNaira: '-5' }, /above ₦0/],
      [{ ...valid, amountNaira: 'abc' }, /above ₦0/],
      [{ ...valid, spentOn: '2026-02-30' }, /real date/i],
      [{ ...valid, paidTo: 'x'.repeat(201) }, /too long/i],
    ];
    for (const [body, message] of cases) {
      const response = need(await POST(post(body), context));
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect((await response.json()).error).toMatch(message);
    }
    expect(spendWrites()).toEqual([]);
  });

  it('does not take kobo from the client: an amount in kobo with no naira is refused', async () => {
    const response = need(await POST(post({ category: 'promo', amountKobo: 5_000_000 }), context));
    expect(response.status).toBe(400);
    expect(spendWrites()).toEqual([]);
  });

  it('refuses a body that is not JSON', async () => {
    expect(need(await POST(post(null, 'not json'), context)).status).toBe(400);
    expect(spendWrites()).toEqual([]);
  });

  it('cannot be used to make an automatic line, or to write to another rollout or person', async () => {
    const response = need(
      await POST(post({ ...valid, source: 'urganize', dedupe_key: 'x', created_by: OWNER, release_id: OTHER_REL, releaseId: OTHER_REL }), context)
    );
    expect(response.status).toBe(201);
    expect(spendWrites()[0].row).toMatchObject({ source: 'manual', release_id: REL, created_by: OWNER });
    expect(spendWrites()[0].row).not.toHaveProperty('dedupe_key');
  });

  it('refuses a team member without spend access (403), and writes nothing', async () => {
    currentUser = MEMBER;
    const response = need(await POST(post(valid), context));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatch(/owner and team managers/i);
    expect(spendWrites()).toEqual([]);
  });

  it('never answers 402, which the browser would turn into a redirect to the paywall', async () => {
    currentUser = MEMBER;
    expect(need(await POST(post(valid), context)).status).not.toBe(402);
  });

  it('refuses a guest at the team-access step, before asking about spend', async () => {
    writeAccess = 'read_only';
    const response = need(await POST(post(valid), context));
    expect(response.status).toBe(403);
    expect(fake.rpcCalls).toEqual([]);
    expect(spendWrites()).toEqual([]);
  });

  it('hides the rollout from an outsider (404)', async () => {
    writeAccess = 'not_found';
    expect(need(await POST(post(valid), context)).status).toBe(404);
    expect(spendWrites()).toEqual([]);
  });

  it('is a 500 and writes nothing when the visibility rule cannot be checked', async () => {
    fakeOptions = { rpc: {} };
    expect(need(await POST(post(valid), context)).status).toBe(500);
    expect(spendWrites()).toEqual([]);
  });

  it('takes a task from this rollout, and refuses one from another', async () => {
    const ok = need(await POST(post({ ...valid, taskId: TASK_OK }), context));
    expect(ok.status).toBe(201);
    expect((await ok.json()).line.taskId).toBe(TASK_OK);
    // Each request builds its own fake client, so count the shared rows, not the write log.
    const before = db.release_spend.length;
    const other = need(await POST(post({ ...valid, taskId: TASK_OTHER }), context));
    expect(other.status).toBe(400);
    expect(db.release_spend).toHaveLength(before);
  });
});
