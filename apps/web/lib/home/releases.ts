import type { Task } from '@/types/tasks';
import type { DbReleaseType } from '@/types/releases';
import { getTemplateStats } from '@/lib/release-templates/loader';
import { daysUntilDate, isTaskLate } from './state';
import type { HomeReleaseSummary } from './types';

/** A release counts as "soon" once it is 14 days out or closer, including a
 * release that has already passed (within the in-flight grace window) — the
 * screens' "dark at 14 days" urgency treatment. */
const SOON_THRESHOLD_DAYS = 14;

export function computeProgress(tasks: readonly Pick<Task, 'status'>[]): {
  done: number;
  total: number;
} {
  const counted = tasks.filter((task) => task.status !== 'cancelled');
  const done = counted.filter((task) => task.status === 'done').length;
  return { done, total: counted.length };
}

export function computeYourPart(
  tasks: readonly Pick<Task, 'status' | 'assignedToUserId'>[],
  viewerId: string
): { done: number; total: number } {
  const yours = tasks.filter((task) => task.assignedToUserId === viewerId && task.status !== 'cancelled');
  return { done: yours.filter((task) => task.status === 'done').length, total: yours.length };
}

export function computeTeamSize(tasks: readonly Pick<Task, 'assignedToUserId'>[]): number {
  return new Set(
    tasks
      .map((task) => task.assignedToUserId)
      .filter((id): id is string => Boolean(id))
  ).size;
}

/**
 * "Week X of Y" against the playbook's own lead/span numbers.
 *
 * The plan's runway starts `leadWeeks` before release day, so that is where
 * week 1 begins; the total span (leadWeeks + post-release weeks) is Y. The
 * current week is clamped into [1, spanWeeks] so a release well past its plan
 * (or one whose date changed since the plan was made) still reads as a
 * sensible week rather than "week 40 of 11".
 */
export function computeWeekProgress(
  releaseDate: string | null,
  releaseType: DbReleaseType,
  now: Date = new Date()
): { current: number; total: number } | null {
  if (!releaseDate) return null;

  const release = new Date(releaseDate);
  if (Number.isNaN(release.getTime())) return null;

  const stats = getTemplateStats(releaseType);
  const planStart = new Date(release);
  planStart.setHours(0, 0, 0, 0);
  planStart.setDate(planStart.getDate() - stats.leadWeeks * 7);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const daysSinceStart = Math.round((today.getTime() - planStart.getTime()) / 86_400_000);
  const currentWeek = Math.floor(daysSinceStart / 7) + 1;
  const total = Math.max(stats.spanWeeks, 1);

  return { current: Math.min(Math.max(currentWeek, 1), total), total };
}

export function buildReleaseSummary(
  release: {
    id: string;
    title: string;
    artistId: string;
    artistName: string;
    releaseType: DbReleaseType;
    releaseDate: string | null;
  },
  tasks: readonly Task[],
  viewerId: string,
  now: Date = new Date()
): HomeReleaseSummary {
  const daysOut = daysUntilDate(release.releaseDate, now);
  const { done, total } = computeProgress(tasks);
  const { done: yourDone, total: yourTotal } = computeYourPart(tasks, viewerId);

  return {
    id: release.id,
    title: release.title,
    artistId: release.artistId,
    artistName: release.artistName,
    releaseType: release.releaseType,
    releaseDate: release.releaseDate,
    daysOut,
    isSoon: daysOut !== null && daysOut <= SOON_THRESHOLD_DAYS,
    progress: { done, total },
    week: computeWeekProgress(release.releaseDate, release.releaseType, now),
    slippingCount: tasks.filter((task) => isTaskLate(task, now)).length,
    yourDone,
    yourTotal,
    teamSize: computeTeamSize(tasks),
  };
}
