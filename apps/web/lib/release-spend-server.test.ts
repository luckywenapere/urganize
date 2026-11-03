import { describe, expect, it } from 'vitest';
import { makeFakeSupabase, type FakeDb } from './test-support/fake-supabase';
import {
  SPEND_WRITE_ERRORS,
  addUrganizeSpendLine,
  canViewReleaseSpend,
  createSpendLine,
  deleteSpendLine,
  loadSpendPayload,
  loadSpendSummary,
  savePaybackAnswer,
  updateSpendLine,
  upsertUrganizeSpendLines,
  type UrganizeSpendLine,
} from './release-spend-server';
import { SPEND_ERRORS, type SpendDraft } from './release-spend';

const OWNER = 'user-owner';
const ADMIN = 'user-admin';
const REL = '11111111-1111-4111-8111-111111111111';
const OTHER_REL = '22222222-2222-4222-8222-222222222222';
const TASK_OK = '33333333-3333-4333-8333-333333333333';
const TASK_OTHER = '44444444-4444-4444-8444-444444444444';

const canViewFor = (allowed: Record<string, string[]>) => (args: { p_release_id: string; p_user_id: string }) =>
  (allowed[args.p_user_id] ?? []).includes(args.p_release_id);

const spendRow = (over: Record<string, unknown> = {}) => ({
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
});

const draft = (over: Partial<SpendDraft> = {}): SpendDraft => ({
  category: 'promo',
  amountKobo: 5_000_000,
  paidTo: 'DJ Spinall',
  spentOn: '2026-10-01',
  taskId: null,
  note: null,
  ...over,
});

function setup(db: FakeDb = {}, options: Parameters<typeof makeFakeSupabase>[1] = {}) {
  const fake = makeFakeSupabase(
    {
      release_spend: [],
      release_payback: [],
      tasks: [
        { id: TASK_OK, release_id: REL },
        { id: TASK_OTHER, release_id: OTHER_REL },
      ],
      workspaces: [{ id: 'ws-1', owner_id: OWNER }],
      ...db,
    },
    {
      rpc: { can_view_release_spend: canViewFor({ [OWNER]: [REL, OTHER_REL], [ADMIN]: [REL] }) },
      ...options,
    }
  );
  return fake;
}

describe('canViewReleaseSpend (the one rule is in the database)', () => {
  it('asks the function, for this rollout and this person', async () => {
    const { client, rpcCalls } = setup();
    expect(await canViewReleaseSpend(client, REL, OWNER)).toBe(true);
    expect(rpcCalls).toEqual([{ name: 'can_view_release_spend', args: { p_release_id: REL, p_user_id: OWNER } }]);
  });

  it('is false for somebody the function says no to', async () => {
    const { client } = setup();
    expect(await canViewReleaseSpend(client, OTHER_REL, ADMIN)).toBe(false);
    expect(await canViewReleaseSpend(client, REL, 'user-stranger')).toBe(false);
  });

  it('FAILS CLOSED: an error is null, never "yes", and never "no" either', async () => {
    const failing = setup({}, { rpc: { can_view_release_spend: () => ({ data: null, error: { message: 'boom' } }) } });
    expect(await canViewReleaseSpend(failing.client, REL, OWNER)).toBeNull();
  });

  it('is null when the function does not exist yet (the migration is not applied)', async () => {
    const missing = setup({}, { rpc: {} });
    expect(await canViewReleaseSpend(missing.client, REL, OWNER)).toBeNull();
  });

  it('is null when the call throws', async () => {
    const { client } = setup();
    (client as unknown as { rpc: () => never }).rpc = () => {
      throw new Error('network');
    };
    expect(await canViewReleaseSpend(client, REL, OWNER)).toBeNull();
  });

  it('is false with no rollout or no person, without asking', async () => {
    const { client, rpcCalls } = setup();
    expect(await canViewReleaseSpend(client, '', OWNER)).toBe(false);
    expect(await canViewReleaseSpend(client, REL, '')).toBe(false);
    expect(rpcCalls).toEqual([]);
  });

  it('treats anything but a literal true as no', async () => {
    for (const answer of [1, 'true', {}, null, undefined]) {
      const { client } = setup({}, { rpc: { can_view_release_spend: () => ({ data: answer, error: null }) } });
      expect(await canViewReleaseSpend(client, REL, OWNER), String(answer)).toBe(false);
    }
  });
});

describe('loadSpendPayload', () => {
  it('returns the lines newest first with the total and the payback', async () => {
    const { client } = setup({
      release_spend: [
        spendRow({ id: 'a', spent_on: '2026-10-01', amount_kobo: 1_000_000 }),
        spendRow({ id: 'b', spent_on: '2026-10-05', amount_kobo: 250_050, source: 'urganize', category: 'other' }),
        spendRow({ id: 'c', release_id: OTHER_REL, amount_kobo: 999 }),
      ],
      release_payback: [{ release_id: REL, asked_at: 'x', amount_kobo: 30_000_000, note: 'good', answered_at: 'y' }],
    });
    const payload = await loadSpendPayload(client, REL, OWNER);
    expect(payload?.canView).toBe(true);
    expect(payload?.lines.map((line) => line.id)).toEqual(['b', 'a']);
    expect(payload?.lines[0].isAutomatic).toBe(true);
    expect(payload?.totalKobo).toBe(1_250_050);
    expect(payload?.payback).toEqual({ askedAt: 'x', amountKobo: 30_000_000, note: 'good', answeredAt: 'y' });
  });

  it('reads an unanswered payback as no amount', async () => {
    const { client } = setup({
      release_payback: [{ release_id: REL, asked_at: 'x', amount_kobo: null, note: null, answered_at: null }],
    });
    const payload = await loadSpendPayload(client, REL, OWNER);
    expect(payload?.payback?.amountKobo).toBeNull();
    expect(payload?.payback?.answeredAt).toBeNull();
  });

  it('is an empty list and a null payback for a rollout with nothing', async () => {
    const { client } = setup();
    expect(await loadSpendPayload(client, REL, OWNER)).toEqual({ canView: true, lines: [], totalKobo: 0, payback: null });
  });

  it('hands somebody who cannot see spend nothing, and does not even read the tables', async () => {
    // Both tables error on any read, so if the function read them it would answer null.
    const { client } = setup(
      { release_spend: [spendRow()] },
      { failSelectOn: ['release_spend', 'release_payback'], rpc: { can_view_release_spend: canViewFor({}) } }
    );
    expect(await loadSpendPayload(client, REL, 'user-member')).toEqual({ canView: false, lines: [], totalKobo: 0, payback: null });
  });

  it('is null (an error, never "no lines") when visibility cannot be checked', async () => {
    const { client } = setup({}, { rpc: {} });
    expect(await loadSpendPayload(client, REL, OWNER)).toBeNull();
  });

  it('is null when the lines or the payback cannot be read', async () => {
    expect(await loadSpendPayload(setup({}, { failSelectOn: ['release_spend'] }).client, REL, OWNER)).toBeNull();
    expect(await loadSpendPayload(setup({}, { failSelectOn: ['release_payback'] }).client, REL, OWNER)).toBeNull();
  });
});

describe('createSpendLine', () => {
  it('writes a manual line stamped with who added it, on the owner\'s team', async () => {
    const { client, inserts } = setup();
    const result = await createSpendLine(client, { releaseId: REL, ownerUserId: OWNER, actorUserId: ADMIN, draft: draft() });
    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].row).toMatchObject({
      release_id: REL,
      workspace_id: 'ws-1',
      category: 'promo',
      amount_kobo: 5_000_000,
      paid_to: 'DJ Spinall',
      spent_on: '2026-10-01',
      task_id: null,
      source: 'manual',
      note: null,
      created_by: ADMIN,
    });
    expect(result.ok && result.value.isAutomatic).toBe(false);
    expect(result.ok && result.value.amountKobo).toBe(5_000_000);
  });

  it('never lets a client choose the source or a dedupe key', async () => {
    const { client, inserts } = setup();
    await createSpendLine(client, {
      releaseId: REL,
      ownerUserId: OWNER,
      actorUserId: OWNER,
      draft: { ...draft(), source: 'urganize', dedupe_key: 'x' } as unknown as SpendDraft,
    });
    expect(inserts[0].row.source).toBe('manual');
    expect(inserts[0].row).not.toHaveProperty('dedupe_key');
  });

  it('accepts a task that belongs to the rollout', async () => {
    const { client, inserts } = setup();
    const result = await createSpendLine(client, { releaseId: REL, ownerUserId: OWNER, actorUserId: OWNER, draft: draft({ taskId: TASK_OK }) });
    expect(result.ok).toBe(true);
    expect(inserts[0].row.task_id).toBe(TASK_OK);
  });

  it('refuses a task from another rollout, or one that does not exist, and writes nothing', async () => {
    for (const taskId of [TASK_OTHER, '55555555-5555-4555-8555-555555555555']) {
      const { client, inserts } = setup();
      const result = await createSpendLine(client, { releaseId: REL, ownerUserId: OWNER, actorUserId: OWNER, draft: draft({ taskId }) });
      expect(result).toEqual({ ok: false, status: 400, error: SPEND_ERRORS.task });
      expect(inserts).toEqual([]);
    }
  });

  it('is a 500, not a pass, when the task cannot be checked', async () => {
    const { client, inserts } = setup({}, { failSelectOn: ['tasks'] });
    const result = await createSpendLine(client, { releaseId: REL, ownerUserId: OWNER, actorUserId: OWNER, draft: draft({ taskId: TASK_OK }) });
    expect(result).toEqual({ ok: false, status: 500, error: SPEND_WRITE_ERRORS.couldNotSave });
    expect(inserts).toEqual([]);
  });

  it('still writes the line when the owner\'s team cannot be found', async () => {
    const { client, inserts } = setup({ workspaces: [] });
    const result = await createSpendLine(client, { releaseId: REL, ownerUserId: OWNER, actorUserId: OWNER, draft: draft() });
    expect(result.ok).toBe(true);
    expect(inserts[0].row.workspace_id).toBeNull();
  });

  it('answers 500 when the insert is refused', async () => {
    const { client } = setup({}, { failInsertOn: 'release_spend' });
    const result = await createSpendLine(client, { releaseId: REL, ownerUserId: OWNER, actorUserId: OWNER, draft: draft() });
    expect(result).toEqual({ ok: false, status: 500, error: SPEND_WRITE_ERRORS.couldNotSave });
  });
});

describe('updateSpendLine', () => {
  it('changes only the columns that were sent', async () => {
    const { client, writes } = setup({ release_spend: [spendRow()] });
    const result = await updateSpendLine(client, { releaseId: REL, lineId: 'line-1', patch: { amountKobo: 700_000 } });
    expect(result.ok && result.value.amountKobo).toBe(700_000);
    expect(writes.find((w) => w.op === 'update')?.patch).toEqual({ amount_kobo: 700_000 });
  });

  it('clears an optional field when the patch says null', async () => {
    const { client } = setup({ release_spend: [spendRow({ note: 'hello', task_id: TASK_OK })] });
    const result = await updateSpendLine(client, { releaseId: REL, lineId: 'line-1', patch: { note: null, taskId: null } });
    expect(result.ok && result.value.note).toBeNull();
    expect(result.ok && result.value.taskId).toBeNull();
  });

  it('refuses a line Urganize wrote, and changes nothing', async () => {
    const { client, writes } = setup({ release_spend: [spendRow({ source: 'urganize', dedupe_key: 'k' })] });
    const result = await updateSpendLine(client, { releaseId: REL, lineId: 'line-1', patch: { amountKobo: 1 } });
    expect(result).toEqual({ ok: false, status: 403, error: SPEND_WRITE_ERRORS.automatic });
    expect(writes).toEqual([]);
  });

  it('answers 404 for a line that does not exist, or that belongs to another rollout', async () => {
    const { client, writes } = setup({ release_spend: [spendRow({ release_id: OTHER_REL })] });
    expect(await updateSpendLine(client, { releaseId: REL, lineId: 'line-1', patch: { note: 'x' } })).toEqual({
      ok: false,
      status: 404,
      error: SPEND_WRITE_ERRORS.notFound,
    });
    expect(await updateSpendLine(client, { releaseId: REL, lineId: 'nope', patch: { note: 'x' } })).toMatchObject({ ok: false, status: 404 });
    expect(writes).toEqual([]);
  });

  it('refuses a new task from another rollout', async () => {
    const { client, writes } = setup({ release_spend: [spendRow()] });
    const result = await updateSpendLine(client, { releaseId: REL, lineId: 'line-1', patch: { taskId: TASK_OTHER } });
    expect(result).toEqual({ ok: false, status: 400, error: SPEND_ERRORS.task });
    expect(writes).toEqual([]);
  });

  it('answers 500 when the update is refused', async () => {
    const { client } = setup({ release_spend: [spendRow()] }, { failWriteOn: ['release_spend'] });
    expect(await updateSpendLine(client, { releaseId: REL, lineId: 'line-1', patch: { note: 'x' } })).toMatchObject({
      ok: false,
      status: 500,
    });
  });
});

describe('deleteSpendLine', () => {
  it('deletes a manual line', async () => {
    const db: FakeDb = { release_spend: [spendRow(), spendRow({ id: 'line-2' })] };
    const { client } = setup(db);
    expect(await deleteSpendLine(client, { releaseId: REL, lineId: 'line-1' })).toEqual({ ok: true, value: { id: 'line-1' } });
    expect(db.release_spend.map((row) => row.id)).toEqual(['line-2']);
  });

  it('refuses a line Urganize wrote, which stays', async () => {
    const db: FakeDb = { release_spend: [spendRow({ source: 'urganize', dedupe_key: 'k' })] };
    const { client } = setup(db);
    expect(await deleteSpendLine(client, { releaseId: REL, lineId: 'line-1' })).toEqual({
      ok: false,
      status: 403,
      error: SPEND_WRITE_ERRORS.automatic,
    });
    expect(db.release_spend).toHaveLength(1);
  });

  it('answers 404 for another rollout\'s line, which stays', async () => {
    const db: FakeDb = { release_spend: [spendRow({ release_id: OTHER_REL })] };
    const { client } = setup(db);
    expect(await deleteSpendLine(client, { releaseId: REL, lineId: 'line-1' })).toMatchObject({ ok: false, status: 404 });
    expect(db.release_spend).toHaveLength(1);
  });
});

describe('lines Urganize writes', () => {
  const credits = (over: Partial<UrganizeSpendLine> = {}): UrganizeSpendLine => ({
    releaseId: REL,
    workspaceId: 'ws-1',
    category: 'other',
    amountKobo: 18_000,
    spentOn: '2026-10-08',
    paidTo: 'Urganize',
    note: '12 AI credits',
    dedupeKey: `credits:${REL}:2026-10-08`,
    ...over,
  });

  it('writes the line as automatic, with no person on it and its key', async () => {
    const { client, inserts } = setup();
    const result = await upsertUrganizeSpendLines(client, [credits()]);
    expect(result).toEqual({ written: 1, error: null });
    expect(inserts[0].row).toMatchObject({
      source: 'urganize',
      created_by: null,
      task_id: null,
      dedupe_key: `credits:${REL}:2026-10-08`,
      category: 'other',
      amount_kobo: 18_000,
    });
  });

  it('writing the same key twice leaves ONE line, with the latest amount', async () => {
    const db: FakeDb = { release_spend: [] };
    const { client } = setup(db);
    await upsertUrganizeSpendLines(client, [credits({ amountKobo: 18_000 })]);
    await upsertUrganizeSpendLines(client, [credits({ amountKobo: 33_000 })]);
    expect(db.release_spend).toHaveLength(1);
    expect(db.release_spend[0].amount_kobo).toBe(33_000);
  });

  it('keeps different days and different rollouts as different lines', async () => {
    const db: FakeDb = { release_spend: [] };
    const { client } = setup(db);
    await upsertUrganizeSpendLines(client, [
      credits(),
      credits({ dedupeKey: `credits:${REL}:2026-10-07`, spentOn: '2026-10-07' }),
      credits({ releaseId: OTHER_REL, dedupeKey: `credits:${OTHER_REL}:2026-10-08` }),
    ]);
    expect(db.release_spend).toHaveLength(3);
  });

  it('leaves out a line with no amount, no key or a bad category', async () => {
    const db: FakeDb = { release_spend: [] };
    const { client, writes } = setup(db);
    const result = await upsertUrganizeSpendLines(client, [
      credits({ amountKobo: 0 }),
      credits({ amountKobo: -5, dedupeKey: 'a' }),
      credits({ dedupeKey: '' }),
      credits({ category: 'merch' as never, dedupeKey: 'b' }),
    ]);
    expect(result).toEqual({ written: 0, error: null });
    expect(writes).toEqual([]);
  });

  it('reports the error and never throws when the write is refused', async () => {
    const { client } = setup({}, { failWriteOn: ['release_spend'] });
    const result = await upsertUrganizeSpendLines(client, [credits()]);
    expect(result.written).toBe(0);
    expect(result.error).toBeTruthy();
  });

  it('addUrganizeSpendLine (the distribution order\'s writer) says whether it wrote', async () => {
    const { client } = setup();
    expect(await addUrganizeSpendLine(client, credits({ category: 'distribution', dedupeKey: 'order:1' }))).toBe(true);
    expect(await addUrganizeSpendLine(setup({}, { failWriteOn: ['release_spend'] }).client, credits())).toBe(false);
    expect(await addUrganizeSpendLine(client, credits({ amountKobo: 0 }))).toBe(false);
  });
});

describe('savePaybackAnswer', () => {
  const now = new Date('2026-10-09T10:00:00Z');

  it('saves the answer on the question that was asked, keeping when it was asked', async () => {
    const db: FakeDb = { release_payback: [{ id: 'p1', release_id: REL, asked_at: '2026-10-01T07:00:00Z', amount_kobo: null, note: null, answered_at: null }] };
    const { client } = setup(db);
    const result = await savePaybackAnswer(client, { releaseId: REL, userId: OWNER, answer: { amountKobo: 30_000_000, note: 'two playlists' }, now });
    expect(result.ok && result.value).toEqual({
      askedAt: '2026-10-01T07:00:00Z',
      amountKobo: 30_000_000,
      note: 'two playlists',
      answeredAt: now.toISOString(),
    });
    expect(db.release_payback).toHaveLength(1);
    expect(db.release_payback[0].answered_by).toBe(OWNER);
  });

  it('creates the row when it was never asked (so it is never asked of somebody who answered)', async () => {
    const db: FakeDb = { release_payback: [] };
    const { client } = setup(db);
    const result = await savePaybackAnswer(client, { releaseId: REL, userId: OWNER, answer: { amountKobo: 0, note: null }, now });
    expect(result.ok && result.value.amountKobo).toBe(0);
    expect(db.release_payback).toHaveLength(1);
  });

  it('replaces an earlier answer', async () => {
    const db: FakeDb = { release_payback: [] };
    const { client } = setup(db);
    await savePaybackAnswer(client, { releaseId: REL, userId: OWNER, answer: { amountKobo: 100, note: null }, now });
    const second = await savePaybackAnswer(client, { releaseId: REL, userId: OWNER, answer: { amountKobo: 900, note: 'better' }, now });
    expect(db.release_payback).toHaveLength(1);
    expect(second.ok && second.value.amountKobo).toBe(900);
  });

  it('answers 500 when the write is refused', async () => {
    const { client } = setup({}, { failWriteOn: ['release_payback'] });
    const result = await savePaybackAnswer(client, { releaseId: REL, userId: OWNER, answer: { amountKobo: 1, note: null }, now });
    expect(result).toEqual({ ok: false, status: 500, error: SPEND_WRITE_ERRORS.couldNotSave });
  });
});

describe('loadSpendSummary (the Home card)', () => {
  const now = new Date('2026-10-09T10:00:00Z');
  const rpcRows = (rows: unknown[]) => ({ release_spend_by_category: () => ({ data: rows, error: null }) });

  it('asks for the last 90 days for this person and adds the categories up', async () => {
    const { client, rpcCalls } = setup(
      {},
      {
        rpc: rpcRows([
          { category: 'promo', amount_kobo: 4_000_000, line_count: 2 },
          { category: 'design', amount_kobo: 9_000_000, line_count: 1 },
        ]),
      }
    );
    const summary = await loadSpendSummary(client, OWNER, now);
    expect(rpcCalls[0]).toEqual({ name: 'release_spend_by_category', args: { p_user_id: OWNER, p_since: '2026-07-12' } });
    expect(summary).toEqual({
      since: '2026-07-12',
      totalKobo: 13_000_000,
      lineCount: 3,
      categories: [
        { category: 'design', label: 'Design', amountKobo: 9_000_000, lineCount: 1 },
        { category: 'promo', label: 'Promo (DJs and blogs)', amountKobo: 4_000_000, lineCount: 2 },
      ],
    });
  });

  it('reads bigint that arrives as text, and an unknown category as other', async () => {
    const { client } = setup({}, { rpc: rpcRows([{ category: 'merch', amount_kobo: '500', line_count: '2' }]) });
    const summary = await loadSpendSummary(client, OWNER, now);
    expect(summary?.categories).toEqual([{ category: 'other', label: 'Other', amountKobo: 500, lineCount: 2 }]);
  });

  it('is empty (not an error) when there is no spend', async () => {
    const { client } = setup({}, { rpc: rpcRows([]) });
    expect(await loadSpendSummary(client, OWNER, now)).toEqual({ since: '2026-07-12', totalKobo: 0, lineCount: 0, categories: [] });
  });

  it('is null when it cannot be read, or with no person', async () => {
    expect(await loadSpendSummary(setup({}, { rpc: {} }).client, OWNER, now)).toBeNull();
    expect(await loadSpendSummary(setup({}, { rpc: rpcRows([]) }).client, '', now)).toBeNull();
    const failing = setup({}, { rpc: { release_spend_by_category: () => ({ data: null, error: { message: 'x' } }) } });
    expect(await loadSpendSummary(failing.client, OWNER, now)).toBeNull();
  });
});
