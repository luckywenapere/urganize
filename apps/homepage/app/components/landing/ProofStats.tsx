import { PROOF_STATS } from "@/content/proof-stats";
import { APP_ORIGIN } from "@/lib/app-urls";

// The homepage's numbers line: how many teams, releases and tasks are already
// in Urganize, beside the main button.
//
// LIVE SINCE #1248. The numbers come from the app (GET /api/public/proof-stats,
// counted from the database with our own accounts and test rollouts left out)
// and are refreshed about once an hour: the fetch is cached for an hour, so
// the page is rebuilt in the background at most that often and never waits on
// the database for a visitor. If the app cannot answer, the page shows the last
// numbers written in content/proof-stats.ts, which are always true, just older.
const fmt = (n: number) => n.toLocaleString("en-US");

type Stats = { teams: number; rollouts: number; tasks: number; countedAt: string };

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

async function loadStats(): Promise<Stats> {
  const fallback: Stats = {
    teams: PROOF_STATS.teams,
    rollouts: PROOF_STATS.rollouts,
    tasks: PROOF_STATS.tasks,
    countedAt: `${PROOF_STATS.measuredOn}T00:00:00Z`,
  };
  try {
    const response = await fetch(`${APP_ORIGIN}/api/public/proof-stats`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return fallback;
    const body = (await response.json()) as Partial<Stats>;
    if (!isCount(body.teams) || !isCount(body.rollouts) || !isCount(body.tasks)) return fallback;
    return {
      teams: body.teams,
      rollouts: body.rollouts,
      tasks: body.tasks,
      countedAt: typeof body.countedAt === "string" ? body.countedAt : new Date().toISOString(),
    };
  } catch {
    return fallback;
  }
}

export async function ProofStats({ className = "" }: { className?: string }) {
  const { teams, rollouts, tasks, countedAt } = await loadStats();
  // Coframe flags a figure with no source; this one says when it was counted.
  const counted = new Date(countedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Lagos",
  });
  return (
    <p className={`text-balance text-sm leading-6 text-[var(--marketing-text-muted)] ${className}`.trim()}>
      <strong className="font-semibold text-[var(--marketing-text)]">{fmt(teams)} music teams</strong> have planned{" "}
      <strong className="font-semibold text-[var(--marketing-text)]">{fmt(rollouts)} releases</strong> and{" "}
      <strong className="font-semibold text-[var(--marketing-text)]">{fmt(tasks)} tasks</strong> in Urganize.{" "}
      <span className="text-[var(--marketing-text-subtle)]">Counted {counted}.</span>
    </p>
  );
}
