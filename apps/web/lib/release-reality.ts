// Is a rollout real, or was somebody just trying the app? (2026-11-28, founder:
// "we need a way to know the difference between release that are actually real
// and the one that were just tests".)
//
// Only rollouts made with "Try a test release" carry the test flag, and almost
// nobody tests that way: they make an ordinary rollout called "Untitled", never
// date it and never touch it. So the answer is read from what people DID with
// the rollout, not from what they said about it. Nobody has to tag anything,
// and it is hard to fake.
//
// - real: it has a real name, a release date, and at least one activity
//   somebody has worked on.
// - test: it carries the test flag, OR it is at least a week old, nobody has
//   worked on any activity, and it has a placeholder name or no date.
// - too early: everything else. A rollout made this morning called "Untitled"
//   is not a test yet; it has not had the chance to become anything.
//
// Pure, so the admin pages and any later count share one definition.

export type ReleaseReality = 'real' | 'test' | 'too_early';

export type ReleaseRealityInput = {
  isTest: boolean;
  title: string | null;
  /** A date with no time ("2026-10-02"), or null when never set. */
  releaseDate: string | null;
  createdAt: string | null;
  /** Activities somebody has worked on: moved off "to do", or edited after they were made. */
  touchedCount: number;
};

/** How long an untouched rollout gets before it counts as a test. */
export const TEST_AFTER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// "Untitled", "Untitled rollout", "Untitled release", "Test", "Unknown yet",
// keyboard mashing. Matched as a whole first word, so "Testament" is a real
// name and "Test" is not.
const PLACEHOLDER_TITLE = /^\s*(untitled|test|testing|unknown|asdf|qwerty|xxx|new (rollout|release))\b/i;

export function isPlaceholderTitle(title: string | null | undefined): boolean {
  const trimmed = String(title ?? '').trim();
  if (!trimmed) return true;
  return PLACEHOLDER_TITLE.test(trimmed);
}

export function classifyReleaseReality(release: ReleaseRealityInput, now: Date): ReleaseReality {
  if (release.isTest) return 'test';
  const named = !isPlaceholderTitle(release.title);
  const dated = Boolean(release.releaseDate);
  if (named && dated && release.touchedCount > 0) return 'real';
  if (release.touchedCount > 0) return 'too_early';
  const created = release.createdAt ? Date.parse(release.createdAt) : NaN;
  const oldEnough = Number.isFinite(created) && now.getTime() - created >= TEST_AFTER_DAYS * DAY_MS;
  if (oldEnough && (!named || !dated)) return 'test';
  return 'too_early';
}

/** An activity somebody has worked on: off "to do", or edited 5+ minutes after it was made. */
export function isTouchedTask(task: { status: string | null; createdAt: string | null; updatedAt: string | null }): boolean {
  if (task.status && task.status !== 'todo') return true;
  const created = task.createdAt ? Date.parse(task.createdAt) : NaN;
  const updated = task.updatedAt ? Date.parse(task.updatedAt) : NaN;
  if (!Number.isFinite(created) || !Number.isFinite(updated)) return false;
  return updated - created >= 5 * 60 * 1000;
}
