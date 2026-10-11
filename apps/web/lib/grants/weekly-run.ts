// The weekly Suggested grants run: the pure decisions the cron makes.
//
// It rides the daily /api/cron/notifications (both Hobby cron slots are taken).
// Each day it handles the teams whose weekday slot is today, so every team is
// looked at once a week and the load is spread (product plan section 3.2).
//
// Who gets suggestions (founder, 2026-10-11: paid plans only):
//   - a team whose owner is paying, on any plan, Solo included. "Gate seats, not
//     features" (2026-09-01) means the plan never decides; paying does.
//   - our own staff team (allowlisted), for the two-week internal read.
//   Trials, grace, comped, credits-only, read-only and walled teams do not. A
//   team we cannot resolve gets nothing: an unknown never grants a paid feature.
//
// A team with no country on its grant profile is skipped: without a place the
// matcher could only offer worldwide funds, which is not a feed worth sending.
//
// Pure. The clock is passed in.

import type { ApplicantType, GrantProgramme, ProgrammeKind, ProgrammeStatus } from './programmes';
import type { GrantGenre, GrantNeed, GrantStage } from './query-builder';

/** Lagos has no daylight saving; WAT is UTC+1 all year. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** The calendar day and weekday (0 = Sunday) in Lagos at `now`. */
export function lagosDay(now: Date): { today: string; weekday: number } {
  const shifted = new Date(now.getTime() + LAGOS_OFFSET_MS);
  return { today: shifted.toISOString().slice(0, 10), weekday: shifted.getUTCDay() };
}

const ELIGIBLE_STATES: ReadonlySet<string> = new Set(['paid', 'allowlisted']);

export function isGrantFeedEligible(state: string | null | undefined): boolean {
  return typeof state === 'string' && ELIGIBLE_STATES.has(state);
}

/**
 * A team already given suggestions this week is not given more. Makes the run
 * safe to repeat on the same day (a retried cron, a manual call) and stops a
 * team whose slot moves from getting two weeks in one.
 */
export const RESUGGEST_AFTER_DAYS = 6;

export function suggestedRecently(lastSuggestedAt: string | null | undefined, now: Date): boolean {
  if (!lastSuggestedAt) return false;
  const at = Date.parse(lastSuggestedAt);
  if (!Number.isFinite(at)) return false;
  return now.getTime() - at < RESUGGEST_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/** How long the grant run may keep starting teams inside the cron's minute. */
export const GRANT_RUN_BUDGET_MS = 5_000;
/** The most teams one call looks at. A ceiling for a bad day, not a plan. */
export const GRANT_RUN_MAX_TEAMS = 200;

export type GrantProgrammeRow = {
  id: string;
  slug: string;
  funder: string;
  programme: string;
  url: string;
  kind: string;
  countries: string[] | null;
  applicant_types: string[] | null;
  needs: string[] | null;
  genres: string[] | null;
  stages: string[] | null;
  amount_min: number | string | null;
  amount_max: number | string | null;
  currency: string | null;
  status: string;
  opens_on: string | null;
  deadline_on: string | null;
  last_closed_on: string | null;
  recurring: boolean | null;
  summary: string | null;
  eligibility: string | null;
  source_url: string;
  checked_on: string;
  active: boolean | null;
};

/** Postgres numeric comes back as a string. */
function amount(value: number | string | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function programmeFromRow(row: GrantProgrammeRow): GrantProgramme {
  return {
    slug: row.slug,
    funder: row.funder,
    programme: row.programme,
    url: row.url,
    kind: row.kind as ProgrammeKind,
    countries: row.countries ?? [],
    applicantTypes: (row.applicant_types ?? []) as ApplicantType[],
    needs: (row.needs ?? []) as GrantNeed[],
    genres: (row.genres ?? []) as GrantGenre[],
    stages: (row.stages ?? []) as GrantStage[],
    amountMin: amount(row.amount_min),
    amountMax: amount(row.amount_max),
    currency: row.currency,
    status: row.status as ProgrammeStatus,
    opensOn: row.opens_on,
    deadlineOn: row.deadline_on,
    lastClosedOn: row.last_closed_on,
    recurring: row.recurring === true,
    summary: row.summary ?? '',
    eligibility: row.eligibility ?? '',
    sourceUrl: row.source_url,
    checkedOn: row.checked_on,
    // A missing flag is not a yes.
    active: row.active === true,
  };
}

/**
 * The phone push sent when a team gets new suggestions (founder, 2026-10-11:
 * a push rather than the in-app bell, which only holds task alerts). Rides the
 * scheduled_notifications queue, so the cron's own flush sends it.
 */
export const GRANT_PUSH_KIND = 'grant_suggestions';
export const GRANT_PUSH_URL = '/dashboard/opportunities';

export function grantPushCopy(count: number): { title: string; body: string } {
  const n = Math.max(1, Math.floor(count));
  return {
    title: n === 1 ? '1 new grant for your team' : `${n} new grants for your team`,
    body: n === 1 ? 'An open grant fits your profile. Take a look in Opportunities.' : 'Open grants that fit your profile. Take a look in Opportunities.',
  };
}
