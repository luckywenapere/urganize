// The reads and writes behind release spend (brief 3, 2026-10-09). The rules
// (categories, validation, totals, the spreadsheet, the payback window) are pure
// and live in lib/release-spend.ts; this file fetches, decides through them, and
// writes. Service-role only.
//
// WHO MAY SEE SPEND IS ONE FUNCTION. public.can_view_release_spend(release_id,
// user_id) is the rule, and it is what the row level security policies call, so
// this file asks the database rather than carrying a second copy in TypeScript.
// Changing who sees a cost is one edit to that function.
//
//   - It FAILS CLOSED. A visibility answer that cannot be read is `null`, and
//     every caller treats null as "do not show and do not write", unlike the
//     fail-open counters elsewhere. Wrongly showing a cost is the harm here.
//   - An automatic line (source 'urganize') is never edited or deleted from
//     here. The routes below refuse it, and every UPDATE and DELETE also carries
//     `source = 'manual'` in its filter, so even a race with a sweep cannot
//     touch one.
//   - Nothing here throws into a request. A write that fails answers with an
//     error the route turns into a status.

import type { SupabaseClient } from '@supabase/supabase-js';

import { presenceDay } from './presence';
import {
  SPEND_ERRORS,
  homeSpendSince,
  isSpendCategory,
  sortSpendLines,
  spendByCategory,
  toPayback,
  toSpendLine,
  totalKobo,
  type CategoryTotal,
  type Payback,
  type PaybackAnswer,
  type PaybackRow,
  type SpendCategory,
  type SpendDraft,
  type SpendLine,
  type SpendLineRow,
} from './release-spend';

const SPEND_TABLE = 'release_spend';
const PAYBACK_TABLE = 'release_payback';
const TASKS_TABLE = 'tasks';
const WORKSPACES_TABLE = 'workspaces';

const SPEND_COLUMNS = 'id,release_id,category,amount_kobo,paid_to,spent_on,task_id,source,note,created_at';
const PAYBACK_COLUMNS = 'release_id,asked_at,amount_kobo,note,answered_at';

/** A rollout with more lines than this is a spreadsheet, not a spend list. */
const MAX_LINES = 1000;

export type SpendWriteResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

/** TODO(copy): the messages the routes show when a write cannot go ahead. */
export const SPEND_WRITE_ERRORS = {
  notFound: 'That spend line is not on this rollout.',
  automatic: 'Lines Urganize added cannot be changed.',
  couldNotSave: 'Could not save that. Try again.',
} as const;

const failure = (status: number, error: string): { ok: false; status: number; error: string } => ({
  ok: false,
  status,
  error,
});

function logError(label: string, error: unknown): void {
  console.error(`[release-spend] ${label}:`, (error as { message?: string } | null)?.message ?? error);
}

// ---------------------------------------------------------------------------
// Who may see it
// ---------------------------------------------------------------------------

/**
 * Whether this person may see and change this rollout's spend, asked of the one
 * rule in the database. `null` means it could not be answered (the function is
 * missing because the migration is not applied, or the call failed) and must be
 * treated as no.
 */
export async function canViewReleaseSpend(
  admin: SupabaseClient,
  releaseId: string,
  userId: string
): Promise<boolean | null> {
  if (!releaseId || !userId) return false;
  try {
    const { data, error } = await admin.rpc('can_view_release_spend', {
      p_release_id: releaseId,
      p_user_id: userId,
    });
    if (error) {
      logError('could not check who may see spend', error);
      return null;
    }
    return data === true;
  } catch (error) {
    logError('could not check who may see spend', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reading a rollout's spend
// ---------------------------------------------------------------------------

export type SpendPayload = {
  canView: boolean;
  lines: SpendLine[];
  totalKobo: number;
  payback: Payback | null;
};

const NOTHING_TO_SHOW: SpendPayload = { canView: false, lines: [], totalKobo: 0, payback: null };

/**
 * What the Spend section draws. A person who cannot see spend gets
 * `canView: false` and nothing else (a 200, so the menu's probe is not an
 * error), and the lines are not even read. Null means something failed and the
 * route answers 500; it is never "no lines".
 */
export async function loadSpendPayload(
  admin: SupabaseClient,
  releaseId: string,
  userId: string
): Promise<SpendPayload | null> {
  const canView = await canViewReleaseSpend(admin, releaseId, userId);
  if (canView === null) return null;
  if (!canView) return { ...NOTHING_TO_SHOW };

  const linesResult = await admin
    .from(SPEND_TABLE)
    .select(SPEND_COLUMNS)
    .eq('release_id', releaseId)
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(MAX_LINES);
  if (linesResult.error || !Array.isArray(linesResult.data)) {
    logError('could not read spend lines', linesResult.error);
    return null;
  }

  const paybackResult = await admin
    .from(PAYBACK_TABLE)
    .select(PAYBACK_COLUMNS)
    .eq('release_id', releaseId)
    .maybeSingle();
  if (paybackResult.error) {
    logError('could not read the payback', paybackResult.error);
    return null;
  }

  const lines = sortSpendLines((linesResult.data as SpendLineRow[]).map(toSpendLine));
  return {
    canView: true,
    lines,
    totalKobo: totalKobo(lines),
    payback: paybackResult.data ? toPayback(paybackResult.data as PaybackRow) : null,
  };
}

// ---------------------------------------------------------------------------
// Writing manual lines
// ---------------------------------------------------------------------------

/** Whether a task is one of this rollout's. Null when it cannot be told. */
async function taskBelongsToRelease(
  admin: SupabaseClient,
  taskId: string,
  releaseId: string
): Promise<boolean | null> {
  const { data, error } = await admin
    .from(TASKS_TABLE)
    .select('id,release_id')
    .eq('id', taskId)
    .maybeSingle();
  if (error) {
    logError('could not check the task', error);
    return null;
  }
  return Boolean(data && (data as { release_id: string | null }).release_id === releaseId);
}

/** The team a rollout's owner runs, kept on the line for the Home card. Null is fine. */
async function workspaceIdForOwner(admin: SupabaseClient, ownerUserId: string): Promise<string | null> {
  const { data, error } = await admin
    .from(WORKSPACES_TABLE)
    .select('id')
    .eq('owner_id', ownerUserId)
    .maybeSingle();
  if (error || !data) return null;
  return String((data as { id: string }).id);
}

export async function createSpendLine(
  admin: SupabaseClient,
  input: { releaseId: string; ownerUserId: string; actorUserId: string; draft: SpendDraft }
): Promise<SpendWriteResult<SpendLine>> {
  const { releaseId, draft } = input;

  if (draft.taskId) {
    const belongs = await taskBelongsToRelease(admin, draft.taskId, releaseId);
    if (belongs === null) return failure(500, SPEND_WRITE_ERRORS.couldNotSave);
    if (!belongs) return failure(400, SPEND_ERRORS.task);
  }

  const workspaceId = await workspaceIdForOwner(admin, input.ownerUserId);
  const { data, error } = await admin
    .from(SPEND_TABLE)
    .insert({
      release_id: releaseId,
      workspace_id: workspaceId,
      category: draft.category,
      amount_kobo: draft.amountKobo,
      paid_to: draft.paidTo,
      spent_on: draft.spentOn,
      task_id: draft.taskId,
      source: 'manual',
      note: draft.note,
      created_by: input.actorUserId,
    })
    .select(SPEND_COLUMNS)
    .single();
  if (error || !data) {
    logError('could not add a spend line', error);
    return failure(500, SPEND_WRITE_ERRORS.couldNotSave);
  }
  return { ok: true, value: toSpendLine(data as SpendLineRow) };
}

/** One line of this rollout, to be changed or deleted. */
async function loadOwnLine(
  admin: SupabaseClient,
  releaseId: string,
  lineId: string
): Promise<SpendWriteResult<SpendLine>> {
  const { data, error } = await admin
    .from(SPEND_TABLE)
    .select(SPEND_COLUMNS)
    .eq('id', lineId)
    .eq('release_id', releaseId)
    .maybeSingle();
  if (error) {
    logError('could not read a spend line', error);
    return failure(500, SPEND_WRITE_ERRORS.couldNotSave);
  }
  if (!data) return failure(404, SPEND_WRITE_ERRORS.notFound);
  const line = toSpendLine(data as SpendLineRow);
  if (line.isAutomatic) return failure(403, SPEND_WRITE_ERRORS.automatic);
  return { ok: true, value: line };
}

export async function updateSpendLine(
  admin: SupabaseClient,
  input: { releaseId: string; lineId: string; patch: Partial<SpendDraft> }
): Promise<SpendWriteResult<SpendLine>> {
  const existing = await loadOwnLine(admin, input.releaseId, input.lineId);
  if (!existing.ok) return existing;

  const { patch } = input;
  if (patch.taskId) {
    const belongs = await taskBelongsToRelease(admin, patch.taskId, input.releaseId);
    if (belongs === null) return failure(500, SPEND_WRITE_ERRORS.couldNotSave);
    if (!belongs) return failure(400, SPEND_ERRORS.task);
  }

  // Only the columns that were sent. `source = 'manual'` is in the filter so a
  // line a sweep owns can never be reached from here, whatever the id.
  const columns: Record<string, unknown> = {};
  if (patch.category !== undefined) columns.category = patch.category;
  if (patch.amountKobo !== undefined) columns.amount_kobo = patch.amountKobo;
  if (patch.paidTo !== undefined) columns.paid_to = patch.paidTo;
  if (patch.spentOn !== undefined) columns.spent_on = patch.spentOn;
  if (patch.taskId !== undefined) columns.task_id = patch.taskId;
  if (patch.note !== undefined) columns.note = patch.note;

  const { data, error } = await admin
    .from(SPEND_TABLE)
    .update(columns)
    .eq('id', input.lineId)
    .eq('release_id', input.releaseId)
    .eq('source', 'manual')
    .select(SPEND_COLUMNS)
    .maybeSingle();
  if (error) {
    logError('could not change a spend line', error);
    return failure(500, SPEND_WRITE_ERRORS.couldNotSave);
  }
  if (!data) return failure(404, SPEND_WRITE_ERRORS.notFound);
  return { ok: true, value: toSpendLine(data as SpendLineRow) };
}

export async function deleteSpendLine(
  admin: SupabaseClient,
  input: { releaseId: string; lineId: string }
): Promise<SpendWriteResult<{ id: string }>> {
  const existing = await loadOwnLine(admin, input.releaseId, input.lineId);
  if (!existing.ok) return existing;

  const { data, error } = await admin
    .from(SPEND_TABLE)
    .delete()
    .eq('id', input.lineId)
    .eq('release_id', input.releaseId)
    .eq('source', 'manual')
    .select('id');
  if (error) {
    logError('could not delete a spend line', error);
    return failure(500, SPEND_WRITE_ERRORS.couldNotSave);
  }
  if (!Array.isArray(data) || data.length === 0) return failure(404, SPEND_WRITE_ERRORS.notFound);
  return { ok: true, value: { id: input.lineId } };
}

// ---------------------------------------------------------------------------
// Lines Urganize writes
// ---------------------------------------------------------------------------

export type UrganizeSpendLine = {
  releaseId: string;
  workspaceId: string | null;
  category: SpendCategory;
  amountKobo: number;
  spentOn: string;
  paidTo: string | null;
  note: string | null;
  /** One stable key per thing that was charged, so writing it twice writes it once. */
  dedupeKey: string;
};

/**
 * Write lines Urganize adds itself, such as a day's credits (the sweep) or, once
 * the partner's API exists, a distribution order. Keyed on dedupeKey, so a sweep
 * that runs twice or covers the same day twice updates a line instead of adding
 * a second, and a later correction to the day's total replaces the amount.
 *
 * A distribution order has NO caller yet, on purpose: Distribute is a hand-off to
 * the partner's own sign-up and Urganize takes no payment and sees no price
 * today. The day it does, the order calls this with category 'distribution' and
 * the price charged.
 */
export async function upsertUrganizeSpendLines(
  admin: SupabaseClient,
  lines: readonly UrganizeSpendLine[]
): Promise<{ written: number; error: string | null }> {
  const rows = lines
    .filter((line) => isSpendCategory(line.category) && line.amountKobo > 0 && line.dedupeKey)
    .map((line) => ({
      release_id: line.releaseId,
      workspace_id: line.workspaceId,
      category: line.category,
      amount_kobo: line.amountKobo,
      paid_to: line.paidTo,
      spent_on: line.spentOn,
      task_id: null,
      source: 'urganize',
      note: line.note,
      dedupe_key: line.dedupeKey,
      created_by: null,
    }));
  if (rows.length === 0) return { written: 0, error: null };

  const { data, error } = await admin
    .from(SPEND_TABLE)
    .upsert(rows, { onConflict: 'dedupe_key' })
    .select('id');
  if (error) {
    logError('could not write Urganize spend lines', error);
    return { written: 0, error: error.message };
  }
  return { written: Array.isArray(data) ? data.length : rows.length, error: null };
}

export async function addUrganizeSpendLine(
  admin: SupabaseClient,
  line: UrganizeSpendLine
): Promise<boolean> {
  const result = await upsertUrganizeSpendLines(admin, [line]);
  return result.error === null && result.written > 0;
}

// ---------------------------------------------------------------------------
// The payback answer
// ---------------------------------------------------------------------------

/**
 * Save the answer to the payback question. It may be saved before the question
 * was ever sent (a team that knows what a release paid back does not have to
 * wait); the row is created then, which also means the question is never sent to
 * somebody who has already answered. Saving again replaces the answer.
 */
export async function savePaybackAnswer(
  admin: SupabaseClient,
  input: { releaseId: string; userId: string; answer: PaybackAnswer; now?: Date }
): Promise<SpendWriteResult<Payback>> {
  const { data, error } = await admin
    .from(PAYBACK_TABLE)
    .upsert(
      {
        release_id: input.releaseId,
        amount_kobo: input.answer.amountKobo,
        note: input.answer.note,
        answered_by: input.userId,
        answered_at: (input.now ?? new Date()).toISOString(),
      },
      { onConflict: 'release_id' }
    )
    .select(PAYBACK_COLUMNS)
    .single();
  if (error || !data) {
    logError('could not save the payback answer', error);
    return failure(500, SPEND_WRITE_ERRORS.couldNotSave);
  }
  return { ok: true, value: toPayback(data as PaybackRow) };
}

// ---------------------------------------------------------------------------
// The Home card
// ---------------------------------------------------------------------------

export type SpendSummary = {
  /** The first day counted, "YYYY-MM-DD". */
  since: string;
  totalKobo: number;
  lineCount: number;
  categories: Array<CategoryTotal & { lineCount: number }>;
};

/**
 * What a person's rollouts spent by category over the last 90 days, counting only
 * rollouts whose spend they may see. One database function does the adding up
 * and asks the same visibility rule about every rollout it counts. Null when it
 * could not be read.
 */
export async function loadSpendSummary(
  admin: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<SpendSummary | null> {
  if (!userId) return null;
  const since = homeSpendSince(now);
  try {
    const { data, error } = await admin.rpc('release_spend_by_category', {
      p_user_id: userId,
      p_since: since,
    });
    if (error || !Array.isArray(data)) {
      logError('could not read the spend summary', error);
      return null;
    }
    const rows = data as Array<{ category: string; amount_kobo: number | string; line_count: number | string }>;
    const counts = new Map<string, number>();
    const forTotals: Array<{ category: SpendCategory; amountKobo: number }> = [];
    for (const row of rows) {
      const category: SpendCategory = isSpendCategory(row.category) ? row.category : 'other';
      forTotals.push({ category, amountKobo: Number(row.amount_kobo) || 0 });
      counts.set(category, (counts.get(category) ?? 0) + (Number(row.line_count) || 0));
    }
    const categories = spendByCategory(forTotals).map((total) => ({
      ...total,
      lineCount: counts.get(total.category) ?? 0,
    }));
    return {
      since,
      totalKobo: categories.reduce((sum, category) => sum + category.amountKobo, 0),
      lineCount: categories.reduce((sum, category) => sum + category.lineCount, 0),
      categories,
    };
  } catch (error) {
    logError('could not read the spend summary', error);
    return null;
  }
}

/** Today in Lagos, "YYYY-MM-DD", for the routes' default date. */
export function spendToday(now: Date = new Date()): string {
  return presenceDay(now);
}
