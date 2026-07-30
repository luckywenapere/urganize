import { NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
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

export const RELEASE_EPKS_TABLE = 'release_epks';

// Feature flag: the whole EPK surface stays dark until
// NEXT_PUBLIC_FEATURE_EPK is 'true'. Every handler checks this first and
// 404s when off, so direct API calls cannot reach the feature either (the
// tailor-plan route precedent). The public /epk/[token] page checks the same
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

// Local ownership check for this route group, mirroring the content-calendar
// one: deliberately NOT the ensureReleaseOwnership in
// app/api/releases/_shared.ts, whose module carries the deprecated
// schema-missing fallback helpers this feature must stay away from (the
// guard test). Same contract: 404 (never 403) when the release is missing or
// owned by someone else.
export async function ensureReleaseOwnership(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  releaseId: string,
  userId: string
): Promise<{ error: NextResponse } | { releaseId: string }> {
  const { data: release, error } = await adminClient
    .from('releases')
    .select('id,owner_user_id')
    .eq('id', releaseId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message || 'Could not load release.' }, { status: 500 }) };
  }

  if (!release || String(release.owner_user_id || '') !== userId) {
    return { error: NextResponse.json({ error: 'Release not found.' }, { status: 404 }) };
  }

  return { releaseId: String(release.id || '') };
}
