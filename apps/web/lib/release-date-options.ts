/**
 * "Help me pick" a release date, as a small decision matrix (2026-10-13).
 *
 * It used to fill in one date: the first Friday with enough runway. A prospect
 * in a live walkthrough asked for something he could actually decide with,
 * such as not landing on top of other releases. So it now offers the next few
 * Fridays that leave enough runway, and checks each one against the things
 * Urganize really knows:
 *
 *  - Runway: how many weeks the plan gets (every option has enough; that is
 *    how the first one is chosen, by `suggestReleaseDate`).
 *  - The Spotify pitch: the plan orders distribution by day -35 and pitches
 *    Spotify editorial by day -28 (lib/editorial-pitch.ts). A date closer than
 *    35 days skips that window.
 *  - The team's own rollouts: one landing the same week splits the team and
 *    the audience.
 *
 * What it cannot check is other artists' releases: nothing in Urganize knows
 * them, so the picker says so rather than pretending.
 *
 * Pure: no React, no storage, no clock. The intake passes today in.
 */

import { DISTRIBUTION_ORDER_LATEST_OFFSET_DAYS } from './editorial-pitch';
import { suggestReleaseDate, type ReadyItem } from './release-planning';

const MS_PER_DAY = 86_400_000;

/** How many Fridays the picker offers. */
export const DATE_OPTION_COUNT = 3;

/** Two release dates this many days apart or closer are "the same week". */
export const SAME_WEEK_DAYS = 6;

/** Release at least this many days out and the plan can order distribution
 *  and pitch Spotify editorial in time. */
export const PITCH_READY_DAYS = -DISTRIBUTION_ORDER_LATEST_OFFSET_DAYS;

export type DateOptionRollout = {
  id: string;
  title: string;
  artistName: string;
  releaseDate: string | null;
  status?: string | null;
  isTest?: boolean;
};

export type DateOptionCheck = {
  key: 'runway' | 'pitch' | 'clash';
  ok: boolean;
  label: string;
};

export type ReleaseDateOption = {
  date: string;
  daysOut: number;
  checks: DateOptionCheck[];
  /** The first option that passes every check. At most one per list. */
  best: boolean;
};

function parseYmd(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const epoch = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(epoch) ? null : epoch;
}

function formatYmd(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 10);
}

function daysBetween(fromYmd: string, toYmd: string): number | null {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  if (from === null || to === null) return null;
  return Math.round((to - from) / MS_PER_DAY);
}

/**
 * The team's other rollouts that have a real date: not the one being planned,
 * not archived, not a test rollout.
 */
export function datedOtherRollouts(
  rollouts: readonly DateOptionRollout[],
  currentReleaseId: string | null | undefined
): DateOptionRollout[] {
  return rollouts.filter(
    (rollout) =>
      rollout.id !== currentReleaseId &&
      rollout.status !== 'archived' &&
      rollout.isTest !== true &&
      parseYmd(rollout.releaseDate) !== null
  );
}

/** The rollouts landing within SAME_WEEK_DAYS of `date`. */
export function rolloutsSameWeek(
  date: string,
  rollouts: readonly DateOptionRollout[]
): DateOptionRollout[] {
  return rollouts.filter((rollout) => {
    const gap = rollout.releaseDate ? daysBetween(date, rollout.releaseDate) : null;
    return gap !== null && Math.abs(gap) <= SAME_WEEK_DAYS;
  });
}

function rolloutName(rollout: DateOptionRollout): string {
  const title = rollout.title.trim() || 'another rollout';
  const artist = rollout.artistName.trim();
  return artist ? `${title} (${artist})` : title;
}

/** "Same week as Free (Dorian)", or "... and 2 more" for several. */
export function describeClash(rollouts: readonly DateOptionRollout[]): string {
  if (rollouts.length === 0) return '';
  const first = `Same week as ${rolloutName(rollouts[0])}`;
  return rollouts.length === 1 ? first : `${first} and ${rollouts.length - 1} more`;
}

function weeksLabel(daysOut: number): string {
  const weeks = Math.floor(daysOut / 7);
  if (weeks < 1) return 'Under a week to get ready';
  return weeks === 1 ? '1 week to get ready' : `${weeks} weeks to get ready`;
}

/**
 * The Fridays to offer, earliest first, each with its checks. The first is the
 * earliest Friday with enough runway for what is left (`suggestReleaseDate`);
 * the rest follow a week apart. Empty when today cannot be read.
 */
export function buildReleaseDateOptions(input: {
  todayYmd: string;
  ready: ReadyItem[];
  leadTimeDays: number;
  others: readonly DateOptionRollout[];
  count?: number;
}): ReleaseDateOption[] {
  const first = suggestReleaseDate(input.todayYmd, input.ready, input.leadTimeDays);
  const firstEpoch = parseYmd(first);
  if (!first || firstEpoch === null) return [];
  const count = Math.max(1, input.count ?? DATE_OPTION_COUNT);

  let bestTaken = false;
  const options: ReleaseDateOption[] = [];
  for (let index = 0; index < count; index += 1) {
    const date = formatYmd(firstEpoch + index * 7 * MS_PER_DAY);
    const daysOut = daysBetween(input.todayYmd, date) ?? 0;
    const clashes = rolloutsSameWeek(date, input.others);
    const checks: DateOptionCheck[] = [
      { key: 'runway', ok: true, label: weeksLabel(daysOut) },
      daysOut >= PITCH_READY_DAYS
        ? { key: 'pitch', ok: true, label: 'Time to pitch Spotify editorial' }
        : { key: 'pitch', ok: false, label: 'Too soon to pitch Spotify editorial' },
      clashes.length === 0
        ? { key: 'clash', ok: true, label: 'No other rollout of yours that week' }
        : { key: 'clash', ok: false, label: describeClash(clashes) },
    ];
    const best = !bestTaken && checks.every((check) => check.ok);
    if (best) bestTaken = true;
    options.push({ date, daysOut, checks, best });
  }
  return options;
}

/** Said beside the options, behind an info icon: what the picker cannot see. */
export const DATE_OPTIONS_LIMIT_NOTE =
  "We can't see other artists' release dates. Check what else drops that Friday before you lock it in.";
