// Matching curated grant programmes to a team, for the weekly Suggested grants feed.
//
// The feed's only source is grant_programmes, a list a person keeps and checks
// (founder decision 2026-10-11, after the live search evaluation failed its bars:
// docs/agent-browser/grant-finder-results.md). This file decides, for one team,
// which open programmes to suggest and why. It never searches and never reads a
// page; the curator did that.
//
// Rules, in order:
//   1. Only active, open programmes of a suggestable kind. A loan or an
//      investment is kept in the list but never suggested as a grant.
//   2. A deadline must be at least MIN_LEAD_DAYS away, so there is time to apply.
//      No deadline means rolling, which is fine when the status is open.
//   3. Country must match: the team's country, its region (AFRICA, SSA, EU) or
//      ANY. A team with no known country only gets ANY programmes.
//   4. Applicant type must overlap (an organisations-only fund is not shown to an
//      individual artist's team).
//   5. A programme's genres and stages, when it lists any, are filters. Empty
//      means any.
//   6. Needs never refuse; they explain and rank.
//
// Pure. No network, no clock (today is passed in), no environment.

import type { GrantCountry, GrantGenre, GrantNeed, GrantStage } from './query-builder';
import { titleCase } from './query-builder';

export const PROGRAMME_KINDS = ['grant', 'residency', 'scholarship', 'prize', 'loan', 'investment'] as const;
export type ProgrammeKind = (typeof PROGRAMME_KINDS)[number];
export const SUGGESTABLE_KINDS: ReadonlySet<ProgrammeKind> = new Set(['grant', 'residency', 'scholarship', 'prize']);

export const PROGRAMME_STATUSES = ['open', 'upcoming', 'closed', 'paused', 'ended'] as const;
export type ProgrammeStatus = (typeof PROGRAMME_STATUSES)[number];

export type ApplicantType = 'individual' | 'organisation';

/** One row of grant_programmes, in camelCase. Dates are YYYY-MM-DD. */
export type GrantProgramme = {
  slug: string;
  funder: string;
  programme: string;
  url: string;
  kind: ProgrammeKind;
  /** ISO 3166 alpha-2 codes, plus the region codes AFRICA, SSA, EU and ANY. */
  countries: string[];
  applicantTypes: ApplicantType[];
  needs: GrantNeed[];
  genres: GrantGenre[];
  stages: GrantStage[];
  amountMin: number | null;
  amountMax: number | null;
  currency: string | null;
  status: ProgrammeStatus;
  opensOn: string | null;
  deadlineOn: string | null;
  lastClosedOn: string | null;
  recurring: boolean;
  summary: string;
  eligibility: string;
  sourceUrl: string;
  checkedOn: string;
  active: boolean;
};

/** What the feed knows about a team, in the grant search's fixed vocabulary only. */
export type TeamGrantProfile = {
  countries: GrantCountry[];
  genres: GrantGenre[];
  stages: GrantStage[];
  needs: GrantNeed[];
  applicantTypes: ApplicantType[];
};

export const MIN_LEAD_DAYS = 3;
export const DEFAULT_WEEKLY_SUGGESTIONS = 3;
const MAX_WHY = 200;

const ISO: Record<string, string> = {
  nigeria: 'NG',
  ghana: 'GH',
  kenya: 'KE',
  'south africa': 'ZA',
  uganda: 'UG',
  tanzania: 'TZ',
  rwanda: 'RW',
  senegal: 'SN',
  cameroon: 'CM',
  ethiopia: 'ET',
  egypt: 'EG',
  morocco: 'MA',
  zimbabwe: 'ZW',
  'united kingdom': 'GB',
  'united states': 'US',
  canada: 'CA',
};

const NORTH_AFRICA = new Set(['egypt', 'morocco']);

/** Every code a programme could list that a team in this country may apply under. */
export function countryCodesFor(country: GrantCountry): Set<string> {
  const codes = new Set<string>(['ANY']);
  if (country === 'africa') {
    codes.add('AFRICA');
    return codes;
  }
  if (country === 'europe') {
    codes.add('EU');
    return codes;
  }
  const iso = ISO[country];
  if (iso) codes.add(iso);
  if (['united kingdom', 'united states', 'canada'].includes(country)) return codes;
  codes.add('AFRICA');
  if (!NORTH_AFRICA.has(country)) codes.add('SSA');
  return codes;
}

function placeLabel(code: string, country: GrantCountry): string {
  if (code === 'ANY') return 'open internationally';
  if (code === 'AFRICA') return 'open across Africa';
  if (code === 'SSA') return 'open across sub-Saharan Africa';
  if (code === 'EU') return 'open in the EU';
  return `open in ${titleCase(country)}`;
}

/** Days from a to b, both YYYY-MM-DD, counted in UTC so no timezone moves a day. */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export type ProgrammeMatch = { programme: GrantProgramme; why: string; score: number };

// The most specific place first, so the reason names the country before a region.
const PLACE_ORDER = (code: string) => (code === 'ANY' ? 3 : code === 'AFRICA' || code === 'EU' ? 2 : code === 'SSA' ? 1 : 0);

export function matchProgramme(
  programme: GrantProgramme,
  team: TeamGrantProfile,
  today: string,
  opts: { minLeadDays?: number } = {}
): ProgrammeMatch | null {
  if (!programme.active || programme.status !== 'open' || !SUGGESTABLE_KINDS.has(programme.kind)) return null;

  const minLead = opts.minLeadDays ?? MIN_LEAD_DAYS;
  if (programme.deadlineOn !== null && daysBetween(today, programme.deadlineOn) < minLead) return null;

  // Country: the most specific code the programme lists that the team can use.
  let place: string | null = null;
  if (programme.countries.includes('ANY')) place = placeLabel('ANY', 'africa');
  let best = 'ANY';
  for (const country of team.countries) {
    const codes = countryCodesFor(country);
    for (const code of programme.countries) {
      if (codes.has(code) && (place === null || PLACE_ORDER(code) < PLACE_ORDER(best))) {
        best = code;
        place = placeLabel(code, country);
      }
    }
  }
  if (place === null) return null;

  if (!programme.applicantTypes.some((type) => team.applicantTypes.includes(type))) return null;

  const genres = programme.genres.filter((genre) => team.genres.includes(genre));
  if (programme.genres.length > 0 && genres.length === 0) return null;
  const stages = programme.stages.filter((stage) => team.stages.includes(stage));
  if (programme.stages.length > 0 && stages.length === 0) return null;
  const needs = programme.needs.filter((need) => team.needs.includes(need));

  const parts = [place.charAt(0).toUpperCase() + place.slice(1)];
  if (genres.length > 0) parts.push(genres.map(titleCase).join(', '));
  if (stages.length > 0) parts.push(stages.join(', '));
  if (needs.length > 0) parts.push(`for ${needs.join(', ')}`);
  let why = parts.join(' · ');
  if (why.length > MAX_WHY) why = `${why.slice(0, MAX_WHY - 1).trimEnd()}…`;

  const score = needs.length * 3 + genres.length * 2 + stages.length * 2 + (best === 'ANY' ? 0 : 1);
  return { programme, why, score };
}

/**
 * This week's picks for one team: never a programme the team was already shown
 * (added or dismissed rows count), best fit first, then the soonest deadline,
 * rolling programmes last.
 */
export function pickSuggestions(
  programmes: readonly GrantProgramme[],
  team: TeamGrantProfile,
  opts: { today: string; alreadySuggested: ReadonlySet<string>; max?: number; minLeadDays?: number }
): ProgrammeMatch[] {
  const matches = programmes
    .filter((programme) => !opts.alreadySuggested.has(programme.slug))
    .map((programme) => matchProgramme(programme, team, opts.today, { minLeadDays: opts.minLeadDays }))
    .filter((match): match is ProgrammeMatch => match !== null);

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = a.programme.deadlineOn ?? '9999-12-31';
    const db = b.programme.deadlineOn ?? '9999-12-31';
    return da < db ? -1 : da > db ? 1 : a.programme.slug.localeCompare(b.programme.slug);
  });
  return matches.slice(0, opts.max ?? DEFAULT_WEEKLY_SUGGESTIONS);
}

/** Which weekday (0 to 6) a team's weekly run falls on, so the daily cron spreads the load. */
export function teamWeekdaySlot(workspaceId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < workspaceId.length; i += 1) {
    hash ^= workspaceId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 7;
}
