// Real usage numbers for the homepage proof line (#1224, from the Coframe
// review: "no counts of users beside the main action").
//
// MEASURED, not estimated, on 12 Nov 2026 from the live database: teams with at
// least one rollout, the rollouts they planned and the tasks in those
// rollouts. Our own accounts (ADMIN_EMAILS plus METRICS_INTERNAL_EMAILS, the
// list /admin/metrics leaves out) and test rollouts are excluded. Numbers only
// ever move up, so an older figure stays true, just modest.
//
// Refresh by re-running the same count and changing the three numbers and the
// date together. Never round up, and never type a number here that was not
// counted.
export const PROOF_STATS = {
  measuredOn: "2026-11-12",
  teams: 44,
  rollouts: 64,
  tasks: 1600,
} as const;
