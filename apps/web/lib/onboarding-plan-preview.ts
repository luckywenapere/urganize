/**
 * The read-only plan preview in onboarding (URG-251, decided by Oyin
 * 2026-10-14, option B): right after "Your first move", a person who did NOT
 * choose to start from scratch sees their rollout laid out week by week, with
 * the key activities of each week, before they make an account.
 *
 * Built entirely client-side from the hand-written playbook the planner starts
 * from (the same choice of playbook as lib/planner-template-preview.ts), with
 * each activity's `offset_days` counted from THEIR release date. No account,
 * no network, no credits. It is a preview, not the plan: the planner still
 * tailors the real one after sign-up.
 *
 * Kept short on purpose: per week, the required activities first, at most
 * `perWeek` of them, plus a "+N more" count. Weeks that are already behind
 * today fold into one "Catch up first" group at the top.
 */

import { previewTemplateFor } from './planner-template-preview';
import type { PlanReleaseType } from './release-planning';

const DAY_MS = 24 * 60 * 60 * 1000;

export type PlanPreviewWeek = {
  /** Stable key: the week's offset from release week (0 = release week). */
  key: string;
  label: string;
  /** ISO date (YYYY-MM-DD) the week starts on; null for the catch-up group. */
  startsOn: string | null;
  isReleaseWeek: boolean;
  isCatchUp: boolean;
  tasks: string[];
  /** Activities in this week not listed above. */
  more: number;
};

export type OnboardingPlanPreview = {
  templateId: string;
  activityCount: number;
  weeks: PlanPreviewWeek[];
};

export const PREVIEW_TASKS_PER_WEEK = 2;

function toPlanReleaseType(releaseType: string | null | undefined): PlanReleaseType {
  return releaseType === 'ep' || releaseType === 'album' ? releaseType : 'single';
}

function parseIsoDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "20 Oct". Fixed words, so the server and the browser agree. */
export function shortDateLabel(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/**
 * The preview for a rollout. Null when the date is not a usable YYYY-MM-DD
 * (the rollout step requires one, so this is only a guard).
 */
export function buildOnboardingPlanPreview(input: {
  releaseType: string | null | undefined;
  releaseDate: string;
  /** Epoch ms for "now"; the catch-up fold is measured from its UTC day. */
  now: number;
  perWeek?: number;
}): OnboardingPlanPreview | null {
  const releaseMs = parseIsoDate(input.releaseDate);
  if (releaseMs === null) return null;
  const perWeek = Math.max(1, input.perWeek ?? PREVIEW_TASKS_PER_WEEK);
  const { template } = previewTemplateFor(toPlanReleaseType(input.releaseType));
  const todayMs = parseIsoDate(toIsoDate(input.now)) ?? input.now;

  type Bucket = { weekOffset: number; required: string[]; optional: string[] };
  const buckets = new Map<number, Bucket>();
  for (const task of template.tasks) {
    // Week 0 is release week: release day and the six days after it.
    const weekOffset = Math.floor(task.offset_days / 7);
    const bucket = buckets.get(weekOffset) ?? { weekOffset, required: [], optional: [] };
    (task.optional ? bucket.optional : bucket.required).push(task.title);
    buckets.set(weekOffset, bucket);
  }

  const ordered = [...buckets.values()].sort((a, b) => a.weekOffset - b.weekOffset);
  const catchUp: Bucket = { weekOffset: Number.NEGATIVE_INFINITY, required: [], optional: [] };
  const upcoming: Bucket[] = [];
  for (const bucket of ordered) {
    const weekEnd = releaseMs + (bucket.weekOffset * 7 + 6) * DAY_MS;
    if (weekEnd < todayMs) {
      catchUp.required.push(...bucket.required);
      catchUp.optional.push(...bucket.optional);
    } else {
      upcoming.push(bucket);
    }
  }

  const toWeek = (bucket: Bucket, isCatchUp: boolean): PlanPreviewWeek => {
    const all = [...bucket.required, ...bucket.optional];
    const tasks = all.slice(0, perWeek);
    const startMs = releaseMs + bucket.weekOffset * 7 * DAY_MS;
    const isReleaseWeek = !isCatchUp && bucket.weekOffset === 0;
    return {
      key: isCatchUp ? 'catch-up' : String(bucket.weekOffset),
      label: isCatchUp
        ? 'Catch up first'
        : isReleaseWeek
          ? `Release week · ${shortDateLabel(releaseMs)}`
          : `Week of ${shortDateLabel(startMs)}`,
      startsOn: isCatchUp ? null : toIsoDate(startMs),
      isReleaseWeek,
      isCatchUp,
      tasks,
      more: all.length - tasks.length,
    };
  };

  const weeks: PlanPreviewWeek[] = [];
  if (catchUp.required.length + catchUp.optional.length > 0) weeks.push(toWeek(catchUp, true));
  for (const bucket of upcoming) weeks.push(toWeek(bucket, false));

  return { templateId: template.id, activityCount: template.tasks.length, weeks };
}
