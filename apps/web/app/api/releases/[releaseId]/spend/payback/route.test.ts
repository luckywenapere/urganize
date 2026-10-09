import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { FakeDb, FakeOptions } from '@/lib/test-support/fake-supabase';
import { MANAGER, MEMBER, OWNER, REL, makeSpendFake, spendDb } from '@/lib/test-support/spend-fixtures';

// The payback answer, through the real route and rules.

let db: FakeDb;
let fakeOptions: FakeOptions;
let currentUser: string;
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
  ensureReleaseTeamWriteAccess: async () =>
    writeAccess === 'ok'
      ? { release: { id: 'rel', ownerUserId: 'user-owner' } }
      : writeAccess === 'read_only'
        ? { error: NextResponse.json({ error: 'Your role in this team is view-only.' }, { status: 403 }) }
        : { error: NextResponse.json({ error: 'Rollout not found.' }, { status: 404 }) },
}));

import { PUT } from './route';

const context = { params: Promise.resolve({ releaseId: REL }) };
const need = (response: Response | undefined): Response => {
  if (!response) throw new Error('The route returned no response.');
  return response;
};
const put = (body: unknown, raw?: string) =>
  new NextRequest(`https://app.test/api/releases/${REL}/spend/payback`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt' },
    body: raw ?? JSON.stringify(body),
  });

beforeEach(() => {
  db = spendDb({
    release_payback: [{ id: 'p1', release_id: REL, asked_at: '2026-10-01T07:00:00Z', amount_kobo: null, note: null, answered_at: null }],
  });
  fakeOptions = {};
  currentUser = OWNER;
  writeAccess = 'ok';
});

describe('PUT', () => {
  it('saves the answer on the question that was asked', async () => {
    const response = need(await PUT(put({ amountNaira: '300,000', note: ' Two playlists added. ' }), context));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.payback).toMatchObject({ askedAt: '2026-10-01T07:00:00Z', amountKobo: 30_000_000, note: 'Two playlists added.' });
    expect(body.payback.answeredAt).toBeTruthy();
    expect(db.release_payback).toHaveLength(1);
    expect(db.release_payback[0].answered_by).toBe(OWNER);
  });

  it('takes zero, since nothing paid back is a real answer', async () => {
    const response = need(await PUT(put({ amountNaira: '0' }), context));
    expect(response.status).toBe(200);
    expect((await response.json()).payback.amountKobo).toBe(0);
  });

  it('can be answered before the question was ever sent, creating the row', async () => {
    db.release_payback = [];
    const response = need(await PUT(put({ amountNaira: 5000 }), context));
    expect(response.status).toBe(200);
    expect(db.release_payback).toHaveLength(1);
  });

  it('replaces an earlier answer', async () => {
    await PUT(put({ amountNaira: 1000 }), context);
    const second = need(await PUT(put({ amountNaira: 9000, note: 'better' }), context));
    expect((await second.json()).payback).toMatchObject({ amountKobo: 900_000, note: 'better' });
    expect(db.release_payback).toHaveLength(1);
  });

  it('refuses a missing, negative or non-number amount with a 400, and writes nothing', async () => {
    for (const body of [{}, { amountNaira: '' }, { amountNaira: '-5' }, { amountNaira: 'abc' }, { amountNaira: null }]) {
      expect(need(await PUT(put(body), context)).status, JSON.stringify(body)).toBe(400);
    }
    expect(need(await PUT(put(null, 'not json'), context)).status).toBe(400);
    expect(db.release_payback[0].answered_at).toBeNull();
  });

  it('works for a manager, and refuses a member without spend access (403)', async () => {
    currentUser = MANAGER;
    expect(need(await PUT(put({ amountNaira: 100 }), context)).status).toBe(200);
    currentUser = MEMBER;
    const refused = need(await PUT(put({ amountNaira: 100 }), context));
    expect(refused.status).toBe(403);
    expect(refused.status).not.toBe(402);
  });

  it('refuses a guest and hides the rollout from an outsider', async () => {
    writeAccess = 'read_only';
    expect(need(await PUT(put({ amountNaira: 100 }), context)).status).toBe(403);
    writeAccess = 'not_found';
    expect(need(await PUT(put({ amountNaira: 100 }), context)).status).toBe(404);
    expect(db.release_payback[0].answered_at).toBeNull();
  });

  it('is a 500 when visibility cannot be checked or the write is refused', async () => {
    fakeOptions = { rpc: {} };
    expect(need(await PUT(put({ amountNaira: 100 }), context)).status).toBe(500);
    fakeOptions = { failWriteOn: ['release_payback'] };
    expect(need(await PUT(put({ amountNaira: 100 }), context)).status).toBe(500);
  });
});
