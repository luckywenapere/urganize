import { NextResponse } from 'next/server';
import { isRolloutIdeasEnabled } from '@/lib/rollout-ideas';
import type { IdeasRelease } from '@/lib/rollout-ideas-server';
import type { ReleaseAccessSummary } from '@/lib/release-access-server';

/**
 * Shared bits for the rollout ideas route group (2026-10-26): the flag, the
 * flag-off answer and the release shape the notify helpers take.
 *
 * Access is the shared team-aware pair (lib/release-access-server.ts), the same
 * as the release chat whose table the notes are stored in: GET reads, every
 * other method writes. Enlisted in lib/release-access-guard.test.ts.
 *
 * NO schema-missing fallback: release_messages is migrated everywhere.
 */

export {
  getAuthenticatedUser,
  requireActiveAuthenticatedUser,
  createAdminClient,
} from '@/app/api/_shared/auth';

export {
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
} from '@/lib/release-access-server';

/** Checked FIRST in every handler, so a direct call cannot reach the feature
 *  when it is off. */
export const ideasEnabled = (): boolean => isRolloutIdeasEnabled();

/** The flag-off answer, byte-identical to every other flag gate in the app. */
export const notFoundResponse = (): NextResponse =>
  NextResponse.json({ error: 'Not found.' }, { status: 404 });

export function toIdeasRelease(release: ReleaseAccessSummary): IdeasRelease {
  return {
    id: release.id,
    title: release.title,
    ownerUserId: release.ownerUserId,
    artistId: release.artistId,
    artistName: release.artistName,
  };
}
