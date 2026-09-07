// Pure aggregation for /admin/urgans: turn raw urgans_actions rows plus the
// three billing_events signal types (urgans_guard_tripped, upgrade_prompt_shown,
// upgrade_clicked) into one row per team, per month, per action type — the
// shape the admin table renders directly.
//
// Deliberately TypeScript, not a SQL view: a view defaults to owner privileges
// and would need `security_invoker` to avoid exposing the aggregate through
// PostgREST for zero benefit at this volume (the same reasoning
// lib/task-owners.ts and every other pure-lib aggregation in this codebase
// already follows — aggregate in the route, not the database).

export type UrgansActionStatus = 'drafted' | 'applied' | 'discarded' | 'failed';

/** Which door a run came through: the embedded button inside a product
 *  surface, or the same job asked of UrgAns in conversation. */
export type UrgansActionSource = 'button' | 'chat';

export type UrgansActionRow = {
  workspaceId: string | null;
  actionType: string;
  status: UrgansActionStatus;
  source: UrgansActionSource;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
};

export type UrgansBillingSignalType =
  | 'urgans_guard_tripped'
  | 'upgrade_prompt_shown'
  | 'upgrade_clicked';

export type UrgansBillingSignalRow = {
  workspaceId: string | null;
  type: UrgansBillingSignalType;
  createdAt: string;
};

export type TeamMonthSummary = {
  workspaceId: string;
  month: string;
  actionType: string;
  /** One of UrgansActionSource, or ALL_SOURCES_BUCKET for a billing signal
   *  that names no door. Typed wide for the same reason actionType is. */
  source: string;
  drafted: number;
  applied: number;
  discarded: number;
  failed: number;
  tokensIn: number;
  tokensOut: number;
  /** How many runs actually reported a token count — the denominator for an
   *  average, since not every run does (a failed run before the model was
   *  ever called, or a gateway that never returned usage). Averaging against
   *  `drafted` instead would understate the true per-call cost by counting
   *  every run that never reported one. */
  tokensReportedCount: number;
  guardTrips: number;
  upgradePromptsShown: number;
  upgradeClicks: number;
};

/** The synthetic action-type bucket a billing signal lands in: none of the
 *  three signal types names a specific action, so folding one onto whichever
 *  action type happened to run that month would misattribute it. Exported so
 *  the admin table can label this bucket specially rather than duplicating
 *  the literal string. */
export const ALL_ACTIONS_BUCKET = '(all actions)';

/** The synthetic door a billing signal lands in, for the same reason
 *  ALL_ACTIONS_BUCKET exists: a guard trip or an upgrade prompt is not
 *  attributable to one door, and filing it under whichever happened to run
 *  that month would misreport it. */
export const ALL_SOURCES_BUCKET = '(any door)';

/** The door a row with no usable source belongs to. Rows written before the
 *  column existed, and the column's own default: the button was the only door
 *  at the time, so reading them as anything else would invent a third. */
const DEFAULT_SOURCE: UrgansActionSource = 'button';

function normalizeSource(source: unknown): UrgansActionSource {
  return source === 'chat' || source === 'button' ? source : DEFAULT_SOURCE;
}

function monthKey(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 7);
}

function emptySummary(
  workspaceId: string,
  month: string,
  actionType: string,
  source: string
): TeamMonthSummary {
  return {
    workspaceId,
    month,
    actionType,
    source,
    drafted: 0,
    applied: 0,
    discarded: 0,
    failed: 0,
    tokensIn: 0,
    tokensOut: 0,
    tokensReportedCount: 0,
    guardTrips: 0,
    upgradePromptsShown: 0,
    upgradeClicks: 0,
  };
}

export function summarizeUrgansActions(
  actions: UrgansActionRow[],
  signals: UrgansBillingSignalRow[]
): TeamMonthSummary[] {
  const map = new Map<string, TeamMonthSummary>();

  const ensure = (
    workspaceId: string,
    month: string,
    actionType: string,
    source: string
  ): TeamMonthSummary => {
    const key = `${workspaceId}::${month}::${actionType}::${source}`;
    let row = map.get(key);
    if (!row) {
      row = emptySummary(workspaceId, month, actionType, source);
      map.set(key, row);
    }
    return row;
  };

  for (const action of actions) {
    if (!action.workspaceId) continue;
    const month = monthKey(action.createdAt);
    if (!month) continue;

    const row = ensure(
      action.workspaceId,
      month,
      action.actionType,
      normalizeSource(action.source)
    );
    row[action.status] += 1;

    // Excluded from the sum rather than treated as zero — a null means "this
    // run never reported a count" (the model was never called, or the
    // gateway returned no usage), which is a different fact from "this run
    // cost nothing." reportedCount is what tells the two apart later.
    if (action.tokensIn !== null || action.tokensOut !== null) {
      row.tokensReportedCount += 1;
    }
    if (action.tokensIn !== null) row.tokensIn += action.tokensIn;
    if (action.tokensOut !== null) row.tokensOut += action.tokensOut;
  }

  for (const signal of signals) {
    if (!signal.workspaceId) continue;
    const month = monthKey(signal.createdAt);
    if (!month) continue;

    const row = ensure(signal.workspaceId, month, ALL_ACTIONS_BUCKET, ALL_SOURCES_BUCKET);
    if (signal.type === 'urgans_guard_tripped') row.guardTrips += 1;
    else if (signal.type === 'upgrade_prompt_shown') row.upgradePromptsShown += 1;
    else row.upgradeClicks += 1;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.month !== b.month) return b.month.localeCompare(a.month);
    if (a.workspaceId !== b.workspaceId) return a.workspaceId.localeCompare(b.workspaceId);
    // Door LAST, so the two doors onto one action sit next to each other
    // rather than the table interleaving every action by door.
    if (a.actionType !== b.actionType) return a.actionType.localeCompare(b.actionType);
    return a.source.localeCompare(b.source);
  });
}
