// The homepage proof numbers (#1248): how many teams have planned rollouts,
// how many rollouts and how many tasks, with our own accounts left out.
//
// The database hands back one row per rollout owner (marketing_proof_rollup,
// test rollouts already removed); this sums them after dropping our own
// people, using the same rule /admin/metrics uses, so the homepage and the
// admin pages agree on who is us. Pure, so it is tested without a database.

export type ProofRollupRow = {
  owner_email: string | null;
  rollouts: number | string | null;
  tasks: number | string | null;
};

export type ProofStats = { teams: number; rollouts: number; tasks: number };

const toCount = (value: number | string | null): number => {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

export function summarizeProofRollup(
  rows: readonly ProofRollupRow[],
  isInternal: (email: string) => boolean,
): ProofStats {
  let teams = 0;
  let rollouts = 0;
  let tasks = 0;
  for (const row of rows) {
    const email = String(row.owner_email ?? "").trim().toLowerCase();
    if (!email || isInternal(email)) continue;
    const ownerRollouts = toCount(row.rollouts);
    if (ownerRollouts === 0) continue;
    teams += 1;
    rollouts += ownerRollouts;
    tasks += toCount(row.tasks);
  }
  return { teams, rollouts, tasks };
}
