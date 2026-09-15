// The pure half of idempotent Apply. server.ts does the actual conditional
// UPDATE this decides; this file only says what to do, never touches a
// database.
//
// A row's `status` is the state machine: 'drafted' (never applied),
// 'applied' (claimed — with or without a result yet), 'discarded', 'failed'.
// There is no separate "applying" status. The CLAIM itself is what flips
// 'drafted' -> 'applied', immediately, before the action's own apply() runs —
// so `applied` with `appliedResult: null` means "someone is applying this, or
// crashed while trying to." That ambiguity is resolved by time: recent means
// probably still running (refuse with 409, do not double-run a model call or
// a task-insert), stale means it crashed and the slot is free again.
//
// This mirrors release_plan_drafts' own claim (its `status='draft'`
// conditional update, one layer down, inside createReleasePlan) — the two
// IDEMPOTENCY CLAIMS defend different call paths, not the same one twice:
// that one is what makes two racing calls to POST .../plan safe even though
// neither touches urgans_actions directly; this one is what makes the /apply
// endpoint safe for ITS OWN callers (a double-tap, two open tabs).

export type UrgansActionStatus = 'drafted' | 'applied' | 'discarded' | 'failed';

export type UrgansActionRowForClaim = {
  status: UrgansActionStatus;
  appliedResult: unknown;
  /** When the row last changed — the claim's own UPDATE bumps this via the
   *  set_updated_at trigger, which is what makes "recent" mean "somebody's
   *  claim is still fresh" rather than "the row is merely old". */
  updatedAt: string | null;
};

/** A claim in flight past this age is presumed dead — the process that held
 *  it crashed or was killed before it could write a result. Long enough that
 *  a real model call (up to the planner's own 25s timeout, plus the write
 *  after it) never gets mistaken for stale; short enough that a genuine crash
 *  does not lock a draft out of Apply for good. */
export const APPLY_CLAIM_STALE_MS = 120_000;

export type ApplyClaimDecision =
  | { kind: 'claim' }
  | { kind: 'return_cached'; result: unknown }
  | { kind: 'in_progress' }
  | { kind: 'reclaim' }
  | { kind: 'refused'; reason: 'discarded' | 'failed' };

/**
 * Decide what an Apply call should do with an urgans_actions row it just
 * read. Never mutates anything — server.ts turns 'claim'/'reclaim' into a
 * conditional UPDATE and only proceeds to run the action's own apply() if
 * that UPDATE actually won the race.
 */
export function decideApplyClaim(
  row: UrgansActionRowForClaim,
  now: Date = new Date()
): ApplyClaimDecision {
  if (row.status === 'drafted') return { kind: 'claim' };

  if (row.status === 'applied') {
    if (row.appliedResult !== null && row.appliedResult !== undefined) {
      return { kind: 'return_cached', result: row.appliedResult };
    }

    const updatedMs = row.updatedAt ? Date.parse(row.updatedAt) : Number.NaN;
    if (Number.isFinite(updatedMs) && now.getTime() - updatedMs < APPLY_CLAIM_STALE_MS) {
      return { kind: 'in_progress' };
    }
    return { kind: 'reclaim' };
  }

  return { kind: 'refused', reason: row.status === 'discarded' ? 'discarded' : 'failed' };
}
