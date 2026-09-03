// The daily cap on UrgAns embedded actions — draft/apply/discard runs inside a
// product function (see the sibling files in this directory). Pure decision
// logic; lib/urgans-actions/guard-server.ts does the counting and the founder
// alert.
//
// WHY A CAP AT ALL, AND WHY IT IS NOT THE CHAT CEILING: an embedded action
// costs a real model call, same as a chat turn, and chat is already metered by
// urgans_monthly_actions (lib/urgans-usage.ts). This is not a second meter on
// the same thing — embedded actions are gated on PLAN TIER
// (urgans_embedded_actions), not billed by volume, so there is no per-plan
// number here to enforce. This cap is a flat, tier-blind runaway-usage
// backstop (a script hammering the run endpoint, a bug in a client retry
// loop), which is why it is a single constant rather than something read from
// ENTITLEMENTS, and why the refusal copy never mentions a plan — the
// entitlement check already owns that conversation; this one is purely "slow
// down".
//
// A ROLLING 24H WINDOW, not a calendar day: "last 24 hours from now", the same
// shape as NOTIFY_ADMIN_PER_ACTOR_COOLDOWN_MS in lib/billing-events.ts, not
// midnight-to-midnight. A calendar-day window would let a burst straddling
// midnight double the effective cap in a few minutes.

/** No env override, on purpose — this is a runaway-usage backstop, not a
 *  per-customer number, so there is nothing to configure per deployment. */
export const EMBEDDED_ACTIONS_DAILY_CAP = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO lower bound for "in the last 24 hours", from `now`. */
export function guardWindowStartIso(now: Date): string {
  return new Date(now.getTime() - DAY_MS).toISOString();
}

export type EmbeddedActionsGuardDecision =
  | { allowed: true }
  | { allowed: false; message: string };

/** May this team run one more embedded action right now?
 *
 * `cap` defaults to EMBEDDED_ACTIONS_DAILY_CAP; tests pass a small number so
 * the boundary can be exercised without a 100-row fixture. The refusal is
 * refused AT the cap, not only past it — a team on its 100th run in the
 * window has used its full allowance. */
export function decideEmbeddedActionsGuard(input: {
  count: number;
  cap?: number;
}): EmbeddedActionsGuardDecision {
  const cap = input.cap ?? EMBEDDED_ACTIONS_DAILY_CAP;
  if (input.count >= cap) {
    return { allowed: false, message: 'UrgAns is busy. Try again in a bit.' };
  }
  return { allowed: true };
}

/**
 * Should a guard trip email the founder?
 *
 * At most one alert per team per 24h (mirrors the notify-admin per-actor
 * cooldown's shape exactly), so a team pinned against the cap for hours
 * cannot turn into an inbox flood — the same reasoning
 * resolveTrackOutcome/isSameUtcDay applies to a repeat wall view, but a
 * rolling window here rather than a UTC calendar day, matching the cap's own
 * window shape above.
 */
export function shouldAlertGuardTrip(input: {
  lastAlertAtIso: string | null;
  now?: Date;
}): boolean {
  if (!input.lastAlertAtIso) return true;
  const now = input.now ?? new Date();
  const lastMs = Date.parse(input.lastAlertAtIso);
  if (!Number.isFinite(lastMs)) return true;
  return now.getTime() - lastMs >= DAY_MS;
}
