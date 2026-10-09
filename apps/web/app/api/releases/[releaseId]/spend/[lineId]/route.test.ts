import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { FakeDb, FakeOptions } from '@/lib/test-support/fake-supabase';
import {
  MEMBER,
  MANAGER,
  OTHER_REL,
  OWNER,
  REL,
  TASK_OK,
  TASK_OTHER,
  makeSpendFake,
  spendDb,
  spendRow,
} from '@/lib/test-support/spend-fixtures';

// Changing or deleting a spend line. The rule that matters most: a line Urganize
// wrote cannot be changed or deleted by anybody, however the request is made.

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

import { DELETE, PATCH } from './route';

const context = (lineId = 'line-1') => ({ params: Promise.resolve({ releaseId: REL, lineId }) });
const need = (response: Response | undefined): Response => {
  if (!response) throw new Error('The route returned no response.');
  return response;
};

const patch = (body: unknown, raw?: string) =>
  new NextRequest(`https://app.test/api/releases/${REL}/spend/line-1`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt' },
    body: raw ?? JSON.stringify(body),
  });
const del = () =>
  new NextRequest(`https://app.test/api/releases/${REL}/spend/line-1`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer jwt' },
  });

const writesTo = (op: string) => fake.writes.filter((write) => write.table === 'release_spend' && write.op === op);

beforeEach(() => {
  db = spendDb({ release_spend: [spendRow()] });
  fakeOptions = {};
  currentUser = OWNER;
  writeAccess = 'ok';
});

describe('PATCH', () => {
  it('changes only what was sent', async () => {
    currentUser = MANAGER;
    const response = need(await PATCH(patch({ amountNaira: '7,000' }), context()));
    expect(response.status).toBe(200);
    expect((await response.json()).line).toMatchObject({ amountKobo: 700_000, category: 'promo', paidTo: 'DJ Spinall' });
    expect(writesTo('update')[0].patch).toEqual({ amount_kobo: 700_000 });
  });

  it('clears an optional field with null and leaves the rest alone', async () => {
    db.release_spend = [spendRow({ note: 'hello' })];
    const response = need(await PATCH(patch({ note: null }), context()));
    const body = await response.json();
    expect(body.line.note).toBeNull();
    expect(body.line.paidTo).toBe('DJ Spinall');
  });

  it('REFUSES a line Urganize wrote (403) and changes nothing', async () => {
    db.release_spend = [spendRow({ source: 'urganize', dedupe_key: 'credits:x:2026-10-01' })];
    const response = need(await PATCH(patch({ amountNaira: 1 }), context()));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatch(/Urganize added/i);
    expect(writesTo('update')).toEqual([]);
    expect(db.release_spend[0].amount_kobo).toBe(5_000_000);
  });

  it('answers 404 for a line on another rollout', async () => {
    db.release_spend = [spendRow({ release_id: OTHER_REL })];
    expect(need(await PATCH(patch({ note: 'x' }), context())).status).toBe(404);
    expect(writesTo('update')).toEqual([]);
  });

  it('answers 404 for a line that does not exist', async () => {
    expect(need(await PATCH(patch({ note: 'x' }), context('missing'))).status).toBe(404);
  });

  it('refuses an empty edit, a bad value and a body that is not JSON with a 400', async () => {
    for (const body of [{}, { amountNaira: 0 }, { category: 'merch' }, { spentOn: '2026-02-30' }, { taskId: 'nope' }]) {
      expect(need(await PATCH(patch(body), context())).status, JSON.stringify(body)).toBe(400);
    }
    expect(need(await PATCH(patch(null, 'not json'), context())).status).toBe(400);
    expect(writesTo('update')).toEqual([]);
  });

  it('takes a task from this rollout and refuses one from another', async () => {
    expect(need(await PATCH(patch({ taskId: TASK_OK }), context())).status).toBe(200);
    expect(need(await PATCH(patch({ taskId: TASK_OTHER }), context())).status).toBe(400);
  });

  it('refuses a team member without spend access (403)', async () => {
    currentUser = MEMBER;
    const response = need(await PATCH(patch({ note: 'x' }), context()));
    expect(response.status).toBe(403);
    expect(writesTo('update')).toEqual([]);
  });

  it('refuses a guest, and hides the rollout from an outsider', async () => {
    writeAccess = 'read_only';
    expect(need(await PATCH(patch({ note: 'x' }), context())).status).toBe(403);
    writeAccess = 'not_found';
    expect(need(await PATCH(patch({ note: 'x' }), context())).status).toBe(404);
  });

  it('is a 500 when the visibility rule cannot be checked', async () => {
    fakeOptions = { rpc: {} };
    expect(need(await PATCH(patch({ note: 'x' }), context())).status).toBe(500);
  });
});

describe('DELETE', () => {
  it('deletes a manual line', async () => {
    db.release_spend = [spendRow(), spendRow({ id: 'line-2' })];
    const response = need(await DELETE(del(), context()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: 'line-1' });
    expect(db.release_spend.map((row) => row.id)).toEqual(['line-2']);
  });

  it('REFUSES a line Urganize wrote (403), which stays', async () => {
    db.release_spend = [spendRow({ source: 'urganize', dedupe_key: 'credits:x:2026-10-01' })];
    expect(need(await DELETE(del(), context())).status).toBe(403);
    expect(db.release_spend).toHaveLength(1);
  });

  it('answers 404 for another rollout\'s line, which stays', async () => {
    db.release_spend = [spendRow({ release_id: OTHER_REL })];
    expect(need(await DELETE(del(), context())).status).toBe(404);
    expect(db.release_spend).toHaveLength(1);
  });

  it('refuses somebody without spend access, and a guest', async () => {
    currentUser = MEMBER;
    expect(need(await DELETE(del(), context())).status).toBe(403);
    currentUser = OWNER;
    writeAccess = 'read_only';
    expect(need(await DELETE(del(), context())).status).toBe(403);
    expect(db.release_spend).toHaveLength(1);
  });
});
