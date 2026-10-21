import { PITCH_WINDOW_CLOSES_DAYS } from './editorial-pitch';
import { isRecapEligible } from './recap-eligibility';

// "Has this rollout's release day come?" for the Distribute and Pitch steps.
// It reuses the one shared rule (lib/recap-eligibility.ts, the same one the
// Catalogue's Released pill reads) with the date clause alone: those steps do
// not load the activity totals. Release day itself counts as out.
export function releaseDayHasPassed(releaseDate: string | null | undefined, now: Date = new Date()): boolean {
  return isRecapEligible(
    { releaseDate: releaseDate ?? null, status: 'draft' },
    { totalTasks: 0, allTasksDone: false },
    now
  );
}

/**
 * The line under "Pitch to their editors" in a rollout's Pitch tab.
 *  - a date still ahead: "Do it at least 7 days before Dec 4"
 *  - no date: the rule alone
 *  - release day has come: "Out on Sep 9, 2026. This window has closed."
 */
export function editorialDueLine(
  releaseDate: string | null | undefined,
  now: Date = new Date(),
  windowDays: number = PITCH_WINDOW_CLOSES_DAYS
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(releaseDate || '');
  if (!match) return `Do it at least ${windowDays} days before release day`;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (releaseDayHasPassed(releaseDate, now)) {
    const full = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `Out on ${full}. This window has closed.`;
  }
  const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `Do it at least ${windowDays} days before ${label}`;
}
