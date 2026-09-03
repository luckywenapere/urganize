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

export type UrgansActionRow = {
  workspaceId: string | null;
  actionType: string;
  status: UrgansActionStatus;
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

function monthKey(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 7);
}

function emptySummary(workspaceId: string, month: string, actionType: string): TeamMonthSummary {
  return {
    workspaceId,
    month,
    actionType,
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

  const ensure = (workspaceId: string, month: string, actionType: string): TeamMonthSummary => {
    const key = `${workspaceId}::${month}::${actionType}`;
    let row = map.get(key);
    if (!row) {
      row = emptySummary(workspaceId, month, actionType);
      map.set(key, row);
    }
    return row;
  };

  for (const action of actions) {
    if (!action.workspaceId) continue;
    const month = monthKey(action.createdAt);
    if (!month) continue;

    const row = ensure(action.workspaceId, month, action.actionType);
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

    const row = ensure(signal.workspaceId, month, ALL_ACTIONS_BUCKET);
    if (signal.type === 'urgans_guard_tripped') row.guardTrips += 1;
    else if (signal.type === 'upgrade_prompt_shown') row.upgradePromptsShown += 1;
    else row.upgradeClicks += 1;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.month !== b.month) return b.month.localeCompare(a.month);
    if (a.workspaceId !== b.workspaceId) return a.workspaceId.localeCompare(b.workspaceId);
    return a.actionType.localeCompare(b.actionType);
  });
}
