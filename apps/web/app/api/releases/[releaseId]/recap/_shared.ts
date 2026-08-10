import { NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
import type { ReleaseRecap } from '@/types/recap';

// The eligibility rule and the input validation are pure logic, so they live in
// lib/ (where the test runner looks) and are re-exported here. The client
// predicate in WorkspaceView mirrors isRecapEligible deliberately; this is the
// single definition both sides are written against.
export {
  RECAP_HIGHLIGHT_MAX_CHARS,
  RECAP_MAX_STREAMS,
  isRecapEligible,
  parseRecapInputs,
} from '@/lib/recap-eligibility';
export type { ParsedRecapInputs } from '@/lib/recap-eligibility';

// Shared helpers for the release recap route group: table constant, the feature
// flag, the row mapper, the local ownership check and the eligibility rule. No
// schema-missing fallback here on purpose: environments are assumed migrated
// (CLAUDE.md "Patterns being deprecated in v1"); a missing table surfaces as a
// normal 500.

// Canonical auth helpers live in app/api/_shared/auth.ts; re-exported here so
// the recap route's import sites stay stable (the EPK route group convention).
export {
  getAuthenticatedUser,
  requireActiveAuthenticatedUser,
  requireAuthenticatedAdmin,
  createAdminClient,
} from '@/app/api/_shared/auth';

export const RELEASE_RECAPS_TABLE = 'release_recaps';

export const RECAP_COLUMNS =
  'id,release_id,first_week_streams,highlight,story_image_path,square_image_path,generated_at,created_at,updated_at';

// Feature flag: the whole recap surface stays dark until
// NEXT_PUBLIC_FEATURE_RELEASE_RECAP is 'true'. Every handler checks this first
// and 404s when off, so direct API calls cannot reach the feature either (the
// EPK route precedent).
export const isRecapFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_RELEASE_RECAP === 'true';

export type RecapReleaseRow = {
  id: string;
  ownerUserId: string;
  title: string;
  artistName: string;
  releaseDate: string | null;
  status: string;
};

export const toReleaseRecap = (
  row: Record<string, unknown>,
  urls: { storyImageUrl: string | null; squareImageUrl: string | null }
): ReleaseRecap => ({
  id: String(row.id || ''),
  releaseId: String(row.release_id || ''),
  firstWeekStreams:
    row.first_week_streams === null || row.first_week_streams === undefined
      ? null
      : Number(row.first_week_streams),
  highlight: row.highlight === null || row.highlight === undefined ? null : String(row.highlight),
  generatedAt: row.generated_at ? String(row.generated_at) : null,
  storyImageUrl: urls.storyImageUrl,
  squareImageUrl: urls.squareImageUrl,
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

// Local ownership check for this route group, mirroring the EPK one:
// deliberately NOT the ensureReleaseOwnership in app/api/releases/_shared.ts,
// whose module carries the deprecated schema-missing fallback helpers this
// feature must stay away from (the guard test). Same contract: 404 (never 403)
// when the release is missing or owned by someone else. Returns the release row
// too, since the recap renderer needs its title, artist and date anyway.
export async function ensureReleaseOwnership(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  releaseId: string,
  userId: string
): Promise<{ error: NextResponse } | { release: RecapReleaseRow }> {
  const { data: release, error } = await adminClient
    .from('releases')
    .select('id,owner_user_id,title,artist_name,release_date,status')
    .eq('id', releaseId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json({ error: error.message || 'Could not load release.' }, { status: 500 }),
    };
  }

  if (!release || String(release.owner_user_id || '') !== userId) {
    return { error: NextResponse.json({ error: 'Release not found.' }, { status: 404 }) };
  }

  return {
    release: {
      id: String(release.id || ''),
      ownerUserId: String(release.owner_user_id || ''),
      title: String(release.title || ''),
      artistName: String(release.artist_name || ''),
      releaseDate: release.release_date ? String(release.release_date) : null,
      status: String(release.status || ''),
    },
  };
}
