import type { ReleaseEpk } from '@/types/epk';

// Shared helpers for the EPK route group (URG-196): table constant, the
// feature flag check, row mapper, and the local ownership check. No
// schema-missing fallback here on purpose: environments are assumed migrated
// (CLAUDE.md "Patterns being deprecated in v1"); a missing table surfaces as
// a normal 500.

// Canonical auth helpers live in app/api/_shared/auth.ts; re-exported here so
// the EPK route import sites stay stable (the releases/_shared.ts convention).
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

export const RELEASE_EPKS_TABLE = 'release_epks';

// Feature flag: the whole EPK surface stays dark until
// NEXT_PUBLIC_FEATURE_EPK is 'true'. Every handler checks this first and
// 404s when off, so direct API calls cannot reach the feature either (the
// plan route precedent). The public /epk/[token] page checks the same
// flag and notFound()s.
export const isEpkFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_EPK === 'true';

export const toReleaseEpk = (row: Record<string, unknown>): ReleaseEpk => ({
  id: String(row.id || ''),
  releaseId: String(row.release_id || ''),
  shareToken: String(row.share_token || ''),
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

