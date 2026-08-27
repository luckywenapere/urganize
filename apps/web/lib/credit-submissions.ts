/**
 * Pure rules for collaborator credit submissions (URG-108, refined 2026-08-27).
 *
 * No React, no I/O, no env — every function here is shared by BOTH the public
 * form (components/credits/CreditSubmissionForm.tsx) and the public submit
 * route (app/api/credits/[token]/route.ts), so the two can never disagree
 * about which fields are required or what counts as the same person. The
 * asset-constants.ts pattern: define the rule once, validate on both sides.
 *
 * vitest only collects lib/**\/*.test.ts, which is the other reason these live
 * here rather than inside the route or the component.
 */

import type { ReleaseCreditRole } from '@/types/credits';

/**
 * Two people are "the same person" on a release when their emails match after
 * trimming and lowercasing. Matching happens in JS rather than through a
 * PostgREST filter on purpose: `.ilike()` treats `_` and `%` as wildcards and
 * underscores are common in email local parts, so `john_doe@x.com` would match
 * `johnXdoe@x.com`.
 */
export function normalizeEmailKey(email: string | null | undefined): string {
  return String(email ?? '').trim().toLowerCase();
}

/**
 * The id of the row this email should UPDATE, or null to insert a new one.
 *
 * A release is capped at 100 submissions, so scanning them client-side costs
 * nothing and avoids the wildcard hazard above. Rows with no email never match
 * anything — the column is nullable even though the form requires it, and a
 * blank must not be treated as an identity that several people share.
 */
export function findSubmissionIdByEmail(
  rows: Array<{ id: string; email: string | null }>,
  email: string
): string | null {
  const key = normalizeEmailKey(email);
  if (!key) return null;
  for (const row of rows) {
    const rowKey = normalizeEmailKey(row.email);
    if (rowKey && rowKey === key) return row.id;
  }
  return null;
}

/** Roles that make the WRITING share a required answer. */
const WRITER_ROLES: ReleaseCreditRole[] = ['songwriter', 'composer', 'lyricist'];
/** Roles that make the RECORDING share a required answer. */
const RECORDING_ROLES: ReleaseCreditRole[] = ['producer'];

export type RequiredSplits = {
  /** True when the picked roles mean a writing share must be given. */
  songwriter: boolean;
  /** True when the picked roles mean a recording share must be given. */
  master: boolean;
};

/**
 * Which splits this person has to answer, derived from the roles they ticked
 * (founder spec: "required for writers and producers").
 *
 * The role list is the detailed eleven, not the spec's five, so "writer" here
 * means any of songwriter / composer / lyricist — all three are writing credits
 * a PRO would register. Engineers, vocalists, musicians and featured artists
 * are asked for nothing: they are usually credited without holding a share, and
 * demanding a number from them would either block a legitimate submission or
 * teach people to type a made-up one.
 */
export function requiredSplits(roles: readonly ReleaseCreditRole[]): RequiredSplits {
  return {
    songwriter: roles.some((role) => WRITER_ROLES.includes(role)),
    master: roles.some((role) => RECORDING_ROLES.includes(role)),
  };
}

/** Plain instructions, not diagnostics — the same words the client shows and
 * the server returns, so a person never sees two different explanations of one
 * problem depending on which layer caught it. */
export const SPLIT_REQUIRED_MESSAGES = {
  songwriter:
    'Add your share of the writing. You picked a writing role, so the team needs that number.',
  master:
    'Add your share of the recording. You picked producer, so the team needs that number.',
} as const;

/** Splits are money, so the format is fixed rather than rounded silently on
 * the user's behalf: one decimal place, matching what the form's number input
 * allows and what the owner's totals display. */
export const SPLIT_PRECISION_MESSAGE =
  'Shares use one decimal place at most, like 33.3.';

export type SplitCheck = { value: number | null; error?: string };

/**
 * Validate one split value. Blank is allowed here — whether blank is ACCEPTABLE
 * depends on the roles picked, which is requiredSplits' job, kept separate so
 * "is this a number" and "is this person required to give one" stay
 * independently testable.
 */
export function checkSplitValue(value: unknown): SplitCheck {
  if (value === null || value === undefined || value === '') return { value: null };
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return { value: null, error: 'Shares must be a number between 0 and 100.' };
  }
  // Reject rather than round: quietly turning the 33.33 someone typed into
  // 33.3 changes a number they may have been given by a publisher.
  if (Math.round(parsed * 10) / 10 !== parsed) {
    return { value: null, error: SPLIT_PRECISION_MESSAGE };
  }
  return { value: parsed };
}

/**
 * The whole submission's split answer, in the order a person reads the form:
 * a malformed number is reported before a missing one, since a value that is
 * present but wrong is the more specific problem.
 */
export function validateSubmissionSplits(input: {
  roles: readonly ReleaseCreditRole[];
  songwriterSplit: unknown;
  masterSplit: unknown;
}): { ok: true; songwriterSplit: number | null; masterSplit: number | null } | { ok: false; error: string } {
  const songwriter = checkSplitValue(input.songwriterSplit);
  if (songwriter.error) return { ok: false, error: songwriter.error };
  const master = checkSplitValue(input.masterSplit);
  if (master.error) return { ok: false, error: master.error };

  const required = requiredSplits(input.roles);
  if (required.songwriter && songwriter.value === null) {
    return { ok: false, error: SPLIT_REQUIRED_MESSAGES.songwriter };
  }
  if (required.master && master.value === null) {
    return { ok: false, error: SPLIT_REQUIRED_MESSAGES.master };
  }

  return { ok: true, songwriterSplit: songwriter.value, masterSplit: master.value };
}
