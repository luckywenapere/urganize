import { PROOF_STATS } from "@/content/proof-stats";

// The homepage's numbers line (#1224): how many teams, releases and tasks are
// already in Urganize, beside the main button. Counted, never estimated; see
// content/proof-stats.ts for how and when. Server component, no hooks.
const fmt = (n: number) => n.toLocaleString("en-US");

export function ProofStats({ className = "" }: { className?: string }) {
  const { teams, rollouts, tasks, measuredOn } = PROOF_STATS;
  // Coframe flags a figure with no source; this one says when it was counted.
  const counted = new Date(`${measuredOn}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
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
