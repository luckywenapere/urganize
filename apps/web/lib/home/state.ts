import type { HomeRole, HomeStateKey } from './types';
import { IN_FLIGHT_GRACE_DAYS } from './config';
import { getTaskSectionKey } from '@/lib/tasks';
import type { Task } from '@/types/tasks';

/**
 * Whole days from `now` (device-local midnight) to `dateStr` (device-local
 * midnight) — negative once the date has passed. Null when the date is
 * missing or unparseable. Mirrors the catalog's own date-bucketing rule
 * (lib/tasks.ts's getTaskSectionKey): device-local, not UTC, so Home agrees
 * with the catalog about what "today" means.
 */
export function daysUntilDate(dateStr: string | null, now: Date = new Date()): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Is this release "in flight" — the spec's "active" release state?
 *
 * A release with a date stays in flight from any time before release day
 * through IN_FLIGHT_GRACE_DAYS after it, so a release that just came out
 * does not vanish from the manager's screen the instant midnight passes. A
 * release with NO date has nothing to measure a grace window against, so it
 * only counts as in flight while it still has open (non-done, non-cancelled)
 * work — otherwise it is neither in flight nor meaningfully "past", and Home
 * simply does not count it toward either state.
 */
export function isReleaseInFlight(
  release: { status: string; releaseDate: string | null },
  hasOpenTasks: boolean,
  now: Date = new Date()
): boolean {
  if (release.status === 'archived') return false;

  if (!release.releaseDate) {
    return hasOpenTasks;
  }

  const daysOut = daysUntilDate(release.releaseDate, now);
  if (daysOut === null) return hasOpenTasks;

  return daysOut >= -IN_FLIGHT_GRACE_DAYS;
}

export type HomeManagerStateValue = 'new' | 'mid_release' | 'between' | 'all_clear';

export type ManagerStateInput = {
  /** Does the primary team have at least one roster artist? */
  hasRosterArtist: boolean;
  /** Total releases the manager runs (owns or their team owns), any status. */
  releaseCount: number;
  inFlightCount: number;
  /** True when every built section (your tasks, waiting, releases,
   * placements, next show) has nothing to show. */
  sectionsAllEmpty: boolean;
};

export function resolveManagerState(input: ManagerStateInput): HomeManagerStateValue {
  if (!input.hasRosterArtist || input.releaseCount === 0) return 'new';
  if (input.inFlightCount > 0) return input.sectionsAllEmpty ? 'all_clear' : 'mid_release';
  return 'between';
}

export type HomeArtistStateValue = 'new' | 'mid_release' | 'between';

export type ArtistStateInput = {
  /** Releases the viewer is on: they own it, they're scoped to its artist, or
   * they hold a task on it. */
  releaseCount: number;
  inFlightCount: number;
};

export function resolveArtistState(input: ArtistStateInput): HomeArtistStateValue {
  if (input.releaseCount === 0) return 'new';
  if (input.inFlightCount > 0) return 'mid_release';
  return 'between';
}

export type HomeLabelStateValue = 'new' | 'busy' | 'gap';

export type LabelStateInput = {
  hasRosterArtist: boolean;
  hasLateTask: boolean;
  /** At least one roster artist has no release dated within the gap window
   * (LABEL_ROSTER_GAP_DAYS). */
  hasArtistWithNoUpcomingRelease: boolean;
};

export function resolveLabelState(input: LabelStateInput): HomeLabelStateValue {
  if (!input.hasRosterArtist) return 'new';
  if (input.hasLateTask) return 'busy';
  if (input.hasArtistWithNoUpcomingRelease) return 'gap';
  // "Otherwise: the Busy layout with empty sections" — busy is the default
  // once there's a roster artist and no gap, whether or not anything is
  // actually late.
  return 'busy';
}

/**
 * "Late" the way the catalog itself means it: the task's own bucketing
 * function puts it in 'overdue'. Deliberately delegating rather than
 * reimplementing a parallel due-date rule — the approved plan requires Home's
 * task grouping to match the catalog's exactly, and STATUS_SECTIONS already
 * excludes anything not currently 'todo' plus a compressed-runway task with
 * no completedAt (those route to 'catch_up', never 'overdue' — see
 * lib/tasks.ts's getTaskSectionKey). Reusing it is what guarantees the two
 * screens can never disagree about what "late" means.
 */
export function isTaskLate(task: Task, now: Date = new Date()): boolean {
  return getTaskSectionKey(task, now) === 'overdue';
}

/** Combines a role with its role-specific state into the one key the UI
 * switches on. */
export function toHomeStateKey(
  role: HomeRole,
  state: HomeManagerStateValue | HomeArtistStateValue | HomeLabelStateValue
): HomeStateKey {
  return `${role}_${state}` as HomeStateKey;
}
