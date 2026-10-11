import { providerCostRodi, type FailedCall, type UsageCall } from '@/lib/credits/pricing';

export type { FailedCall };

/**
 * The shape of the AI usage log: one row per provider call, so the real cost of
 * a release can be summed (migration 20261003120000_ai_usage_events.sql).
 *
 * This file is the PURE half: it turns what a request used into rows. The write
 * is lib/ai/usage-log-server.ts, which is the only file that touches the table.
 *
 * The credit ledger is the record of MONEY (what a team was charged); this is
 * the record of COST (what the provider billed us). They share a request id, so
 * a charge can be set beside what it cost, but neither is derived from the other,
 * and this one also holds the calls nobody was charged for: a run that failed,
 * and the features that are not metered.
 *
 * Two facts shape the rows:
 *
 *  - A FAILED call has an UNKNOWN cost, never a zero. The gateway reports no
 *    token counts for a request that failed or was abandoned, yet the provider
 *    can still bill the output it had written (the 2026-10-02 timeout billed
 *    about 200 RODI for an answer nobody received). So `cost_rodi` is null on a
 *    failed row, and a failure's volume is visible even where its cost is not.
 *  - The credits a request was charged sit on its FIRST row only, so a sum over
 *    a release counts them once however many calls the request made.
 */

// 'voice' (2026-10-11): an UrgAns turn asked for by a voice call's urgans_do
// tool (app/api/urgans/voice/tool), recorded apart from typed chat.
export const AI_USAGE_FEATURES = ['chat', 'plan', 'press_kit', 'pitch_kit', 'spotify_pitch', 'status', 'outcome', 'voice'] as const;
export type AiUsageFeature = (typeof AI_USAGE_FEATURES)[number];

/** Who a request belongs to. Every id is optional in the log and checked before it is written. */
export type UsageLogContext = {
  /** Identifies the request. For a charged request this is the id the ledger spend row carries too. */
  requestId: string;
  feature: AiUsageFeature;
  workspaceId: string | null;
  ownerUserId: string | null;
  actorUserId: string | null;
  releaseId: string | null;
};

export type UsageEventRow = {
  request_id: string;
  call_index: number;
  workspace_id: string | null;
  owner_user_id: string | null;
  actor_user_id: string | null;
  release_id: string | null;
  feature: AiUsageFeature;
  model: string | null;
  status: 'ok' | 'failed';
  failure_kind: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  tokens_cached: number | null;
  cost_rodi: number | null;
  cost_assumed: boolean;
  credits_charged: number;
};

/** More than this and a request is doing something other than a run; the rest are not written. */
export const MAX_USAGE_ROWS = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True for a uuid. The log's id columns are uuids, and Postgres rejects a whole
 * insert on one bad value, so a release id that came from a client (the chat's
 * scope picker) is checked here rather than trusted.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

const idOrNull = (value: string | null): string | null => (isUuid(value) ? value : null);

const intOrNull = (value: number | null): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

/**
 * The rows for one request: its successful calls first, then its failures. The
 * order within each group is the order the calls were made; the two groups are
 * kept apart because they are collected apart, so `call_index` only says which
 * row is which, not which call came first.
 */
export function buildUsageRows(input: {
  context: UsageLogContext;
  calls: readonly UsageCall[];
  failures: readonly FailedCall[];
  creditsCharged: number;
}): UsageEventRow[] {
  const { context } = input;
  const charged = Number.isFinite(input.creditsCharged) ? Math.max(0, Math.round(input.creditsCharged)) : 0;
  const base = {
    request_id: context.requestId,
    workspace_id: idOrNull(context.workspaceId),
    owner_user_id: idOrNull(context.ownerUserId),
    actor_user_id: idOrNull(context.actorUserId),
    release_id: idOrNull(context.releaseId),
    feature: context.feature,
  };

  const rows: UsageEventRow[] = [];

  for (const call of input.calls) {
    const cost = providerCostRodi(call);
    rows.push({
      ...base,
      call_index: rows.length,
      model: call.model || null,
      status: 'ok',
      failure_kind: null,
      tokens_in: intOrNull(call.promptTokens),
      tokens_out: intOrNull(call.completionTokens),
      tokens_cached: intOrNull(call.cachedTokens),
      cost_rodi: Math.round(cost.rodi * 1000) / 1000,
      cost_assumed: cost.assumed,
      credits_charged: 0,
    });
  }

  for (const failure of input.failures) {
    rows.push({
      ...base,
      call_index: rows.length,
      model: failure.model || null,
      status: 'failed',
      failure_kind: failure.kind || 'unknown',
      tokens_in: null,
      tokens_out: null,
      tokens_cached: null,
      cost_rodi: null,
      cost_assumed: false,
      credits_charged: 0,
    });
  }

  if (rows.length === 0) return [];
  rows[0].credits_charged = charged;
  return rows.slice(0, MAX_USAGE_ROWS);
}

/** What a request used before it failed. */
export type UsageOnError = { usageCalls: UsageCall[]; failedCalls: FailedCall[] };

// Held beside the error rather than on it, so nothing mutates an object this
// code does not own (an error from fetch, or a frozen one) and a thrown value
// that is not an object is simply ignored.
const carried = new WeakMap<object, UsageOnError>();

/**
 * Let the route that catches a failed turn read what it had already used. A turn
 * that fails on its third model call has still paid for the first two, and the
 * runner is the only thing that knows them.
 */
export function attachUsageToError(error: unknown, usage: UsageOnError): void {
  if (typeof error !== 'object' || error === null) return;
  carried.set(error, usage);
}

export function usageFromError(error: unknown): UsageOnError {
  if (typeof error !== 'object' || error === null) return { usageCalls: [], failedCalls: [] };
  return carried.get(error) ?? { usageCalls: [], failedCalls: [] };
}
