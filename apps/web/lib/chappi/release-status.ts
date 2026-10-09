import { displayStatus } from '@/lib/catalogue-table';

/**
 * The status UrgAns reports for a rollout (2026-10-09, v1.92.9).
 *
 * Nothing in the product writes the `released` status, so the stored value reads
 * "draft" for a rollout that came out months ago. The Catalogue already shows a
 * derived status (`displayStatus`, which reuses `lib/recap-eligibility`'s rule
 * and never writes), but the assistant was handed the stored one: its snapshot
 * told it every rollout was a draft, in every turn. It now says what the
 * Catalogue says.
 *
 * `tasks` is the rollout's activity counts. Pass `null` when they are not known
 * (a list of rollouts with no activities loaded): the release date alone then
 * decides, and an empty rollout is never called released for having "all" of
 * nothing done.
 */
export function assistantReleaseStatus(
  release: { status: string; releaseDate?: string | null },
  tasks: { done: number; total: number } | null,
  now: Date = new Date()
): string {
  return displayStatus(
    {
      status: release.status,
      releaseDate: release.releaseDate ?? null,
      tasksDone: tasks?.done ?? 0,
      tasksTotal: tasks?.total ?? 0,
    },
    now
  );
}

/** A `YYYY-MM-DD` day as the local-midnight Date `displayStatus` compares against. */
export function dayToDate(day: string): Date {
  const parsed = new Date(`${day}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}
