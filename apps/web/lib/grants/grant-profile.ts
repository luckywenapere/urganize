// A team's grant profile: the few facts the weekly Suggested grants feed
// matches on. Set by the team on the Opportunities page.
//
// Founder call (2026-10-11): teams stored no country or career stage anywhere,
// so the feed could not match. Rather than guess them from releases or the
// directory, the team says them once.
//
// Every field is picked from a fixed list, the same vocabulary the grant search
// uses (query-builder.ts). No free text, so nothing a person typed can reach the
// matcher or a log.
//
// Pure. No network, no clock, no environment.

import {
  GRANT_COUNTRIES,
  GRANT_GENRES,
  GRANT_NEEDS,
  GRANT_STAGES,
  type GrantCountry,
  type GrantGenre,
  type GrantNeed,
  type GrantStage,
} from './query-builder';
import type { ApplicantType, TeamGrantProfile } from './programmes';

/** Countries a team can be in. The regions in the search vocabulary are not places a team lives. */
export const GRANT_PROFILE_COUNTRIES = GRANT_COUNTRIES.filter(
  (country): country is Exclude<GrantCountry, 'africa' | 'europe'> => country !== 'africa' && country !== 'europe'
);
export const APPLICANT_TYPES: readonly ApplicantType[] = ['individual', 'organisation'];
export const MAX_PROFILE_GENRES = 3;
export const MAX_PROFILE_NEEDS = 5;

export type GrantProfile = {
  country: GrantCountry | null;
  stage: GrantStage | null;
  applicantTypes: ApplicantType[];
  genres: GrantGenre[];
  needs: GrantNeed[];
};

export const EMPTY_GRANT_PROFILE: GrantProfile = {
  country: null,
  stage: null,
  applicantTypes: ['individual'],
  genres: [],
  needs: [],
};

export const APPLICANT_LABEL: Record<ApplicantType, string> = {
  individual: 'The artist, as a person',
  organisation: 'A registered company or label',
};

export const GRANT_PROFILE_COPY = {
  title: 'Grant profile',
  description: 'Tell us where you are based and what you need. We use it to suggest grants you can apply for.',
  missingCountry: 'Pick a country so we can suggest grants.',
  save: 'Save profile',
};

type Parsed = { value: GrantProfile } | { error: string };

function optionalOne<T extends string>(vocabulary: readonly T[], value: unknown, field: string): { ok: T | null } | { error: string } {
  if (value === undefined || value === null || value === '') return { ok: null };
  if (typeof value === 'string' && (vocabulary as readonly string[]).includes(value)) return { ok: value as T };
  return { error: `Pick a ${field} from the list.` };
}

function many<T extends string>(vocabulary: readonly T[], value: unknown, field: string, max: number): { ok: T[] } | { error: string } {
  if (value === undefined || value === null) return { ok: [] };
  if (!Array.isArray(value)) return { error: `Pick ${field} from the list.` };
  const picked: T[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !(vocabulary as readonly string[]).includes(item)) return { error: `Pick ${field} from the list.` };
    if (!picked.includes(item as T)) picked.push(item as T);
  }
  if (picked.length > max) return { error: `Pick up to ${max} ${field}.` };
  return { ok: picked };
}

/** What the PUT route accepts. Unknown keys are ignored; known keys must be in their list. */
export function parseGrantProfile(input: unknown): Parsed {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Send the profile as an object.' };
  const source = input as Record<string, unknown>;

  const country = optionalOne(GRANT_PROFILE_COUNTRIES, source.country, 'country');
  if ('error' in country) return country;
  const stage = optionalOne(GRANT_STAGES, source.stage, 'career stage');
  if ('error' in stage) return stage;
  const applicantTypes = many(APPLICANT_TYPES, source.applicantTypes, 'who applies', APPLICANT_TYPES.length);
  if ('error' in applicantTypes) return applicantTypes;
  if (applicantTypes.ok.length === 0) return { error: 'Pick who applies: the artist, a company, or both.' };
  const genres = many(GRANT_GENRES, source.genres, 'genres', MAX_PROFILE_GENRES);
  if ('error' in genres) return genres;
  const needs = many(GRANT_NEEDS, source.needs, 'needs', MAX_PROFILE_NEEDS);
  if ('error' in needs) return needs;

  return {
    value: {
      country: country.ok,
      stage: stage.ok,
      applicantTypes: applicantTypes.ok,
      genres: genres.ok,
      needs: needs.ok,
    },
  };
}

export type GrantProfileRow = {
  country: string | null;
  stage: string | null;
  applicant_types: string[] | null;
  genres: string[] | null;
  needs: string[] | null;
};

function keep<T extends string>(vocabulary: readonly T[], values: string[] | null | undefined): T[] {
  return (values ?? []).filter((value): value is T => (vocabulary as readonly string[]).includes(value));
}

/** A stored row back into a profile. Drops anything the vocabulary no longer has rather than failing. */
export function grantProfileFromRow(row: GrantProfileRow | null): GrantProfile {
  if (!row) return { ...EMPTY_GRANT_PROFILE };
  const country = (GRANT_PROFILE_COUNTRIES as readonly string[]).includes(row.country ?? '') ? (row.country as GrantCountry) : null;
  const stage = (GRANT_STAGES as readonly string[]).includes(row.stage ?? '') ? (row.stage as GrantStage) : null;
  const applicantTypes = keep(APPLICANT_TYPES, row.applicant_types);
  return {
    country,
    stage,
    applicantTypes: applicantTypes.length > 0 ? applicantTypes : [...EMPTY_GRANT_PROFILE.applicantTypes],
    genres: keep(GRANT_GENRES, row.genres),
    needs: keep(GRANT_NEEDS, row.needs),
  };
}

/** The feed suggests nothing until the team has said where it is based. */
export function isGrantProfileReady(profile: GrantProfile): boolean {
  return profile.country !== null;
}

export function toTeamGrantProfile(profile: GrantProfile): TeamGrantProfile {
  return {
    countries: profile.country ? [profile.country] : [],
    stages: profile.stage ? [profile.stage] : [],
    applicantTypes: [...profile.applicantTypes],
    genres: [...profile.genres],
    needs: [...profile.needs],
  };
}
