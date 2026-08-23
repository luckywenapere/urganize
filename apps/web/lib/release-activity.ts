// What counts as an ACTIVE release.
//
// One definition, in one place, because two things now depend on agreeing: the
// identity card's "N active releases" stat line, and the Manager tier's
// active-release ceiling. A cap that counted differently from the number shown
// beside it would be indefensible.
//
// NAMING: not `release-status.ts` — that name is taken by the AI status-update
// generator's prompt builders, which are a completely unrelated concern.
//
// This is deliberately NOT `isRecapEligible` (lib/recap-eligibility.ts), which
// answers a different question — "is this release finished enough to celebrate"
// — using the release date and task completion. That predicate is generous on
// purpose: a release whose date has passed is recap-eligible even though its
// status still says draft. Using it here would silently free a cap slot the
// moment a release date went by, which is neither what "not marked complete or
// archived" means nor anything the user did.
//
// Until 2026-08-23 nothing in the product wrote either inactive status, so the
// identity card's count was really total-releases-ever. The archive action makes
// this live.

import { RELEASE_STATUS_OPTIONS, type ReleaseStatus } from '@/types/releases';

/** A release stops being active once it is shipped or shelved. */
export const INACTIVE_RELEASE_STATUSES: readonly ReleaseStatus[] = ['released', 'archived'] as const;

const INACTIVE = new Set<string>(INACTIVE_RELEASE_STATUSES);

/** Is this release still being worked?
 *
 * Takes a raw string rather than the union, because every caller reads it off a
 * database row or an API payload where it is typed `string`. An unrecognised
 * value counts as ACTIVE: `releases.status` has no DB CHECK constraint, so an
 * unexpected value is possible rather than theoretical, and silently freeing a
 * cap slot for a status nobody understands is the worse way to be wrong. */
export function isReleaseActive(status: string | null | undefined): boolean {
  if (!status) return true;
  return !INACTIVE.has(status);
}

/** The two statuses the archive action toggles between.
 *
 * Restoring writes `draft` rather than whatever the release held before being
 * archived, because nothing records that. `draft` is honest — it is also what
 * the release detail endpoint computes for a release with no collaborators — and
 * the real progress is visible from the activities either way. */
export const ARCHIVED_STATUS: ReleaseStatus = 'archived';
export const RESTORED_STATUS: ReleaseStatus = 'draft';

export function isValidReleaseStatusValue(value: unknown): value is ReleaseStatus {
  return typeof value === 'string' && (RELEASE_STATUS_OPTIONS as readonly string[]).includes(value);
}
