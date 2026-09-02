import type { ReleaseRecap } from '@/types/recap';

// The eligibility rule and the input validation are pure logic, so they live in
// lib/ (where the test runner looks) and are re-exported here. The client
// predicate in WorkspaceView mirrors isRecapEligible deliberately; this is the
// single definition both sides are written against.
export {
  RECAP_HIGHLIGHT_MAX_CHARS,
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

// Release access is the shared team-aware pair (whole-workspace visibility;
// guests read-only on writes) — re-exported so this group's import sites
// stay stable, same convention as the auth helpers above.
export {
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
} from '@/lib/release-access-server';

export const RELEASE_RECAPS_TABLE = 'release_recaps';

export const RECAP_COLUMNS =
  'id,release_id,highlight,story_image_path,square_image_path,generated_at,created_at,updated_at';

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
  highlight: row.highlight === null || row.highlight === undefined ? null : String(row.highlight),
  generatedAt: row.generated_at ? String(row.generated_at) : null,
  storyImageUrl: urls.storyImageUrl,
  squareImageUrl: urls.squareImageUrl,
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

