import { NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
import { RELEASE_CREDIT_ROLE_OPTIONS } from '@/types/credits';
import type { ReleaseCreditLink, ReleaseCreditRole, ReleaseCreditSubmission } from '@/types/credits';

// Shared helpers for the release-credits route group (URG-108): table
// constants, the feature flag check, row mappers, and the local ownership
// check. No schema-missing fallback here on purpose: environments are
// assumed migrated (CLAUDE.md "Patterns being deprecated in v1"); a missing
// table surfaces as a normal 500. Mirrors the EPK route group exactly.

// Canonical auth helpers live in app/api/_shared/auth.ts; re-exported here so
// the route group's import sites stay stable (the EPK route group convention).
export {
  getAuthenticatedUser,
  requireActiveAuthenticatedUser,
  requireAuthenticatedAdmin,
  createAdminClient,
} from '@/app/api/_shared/auth';

export const RELEASE_CREDIT_LINKS_TABLE = 'release_credit_links';
export const RELEASE_CREDIT_SUBMISSIONS_TABLE = 'release_credit_submissions';

// Feature flag: the whole surface (this route group, the public
// /credits/[token] page + its POST route, and every entry-point link) stays
// dark until NEXT_PUBLIC_FEATURE_METADATA is 'true'. Every handler checks
// this first and 404s when off, so direct API calls cannot reach the
// feature either (the EPK precedent).
export const isMetadataFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true';

export const toReleaseCreditLink = (row: Record<string, unknown>): ReleaseCreditLink => ({
  id: String(row.id || ''),
  releaseId: String(row.release_id || ''),
  shareToken: String(row.share_token || ''),
  closedAt: row.closed_at ? String(row.closed_at) : null,
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

const ROLE_SET = new Set<string>(RELEASE_CREDIT_ROLE_OPTIONS);

function toRoleArray(value: unknown): ReleaseCreditRole[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ReleaseCreditRole => typeof item === 'string' && ROLE_SET.has(item));
}

function toSplit(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export const toReleaseCreditSubmission = (row: Record<string, unknown>): ReleaseCreditSubmission => ({
  id: String(row.id || ''),
  releaseId: String(row.release_id || ''),
  legalName: String(row.legal_name || ''),
  stageName: String(row.stage_name || ''),
  roles: toRoleArray(row.roles),
  contribution: String(row.contribution || ''),
  email: String(row.email || ''),
  phone: String(row.phone || ''),
  country: String(row.country || ''),
  songwriterSplit: toSplit(row.songwriter_split),
  proAffiliation: String(row.pro_affiliation || ''),
  ipiNumber: String(row.ipi_number || ''),
  publisherName: String(row.publisher_name || ''),
  publisherIpi: String(row.publisher_ipi || ''),
  masterSplit: toSplit(row.master_split),
  instagramHandle: String(row.instagram_handle || ''),
  xHandle: String(row.x_handle || ''),
  bio: String(row.bio || ''),
  confirmedAccurate: Boolean(row.confirmed_accurate),
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

// Local ownership check for this route group, mirroring the EPK one:
// deliberately NOT the ensureReleaseOwnership in app/api/releases/_shared.ts,
// whose module carries the deprecated schema-missing fallback helpers this
// feature must stay away from (the guard test). Same contract: 404 (never
// 403) when the release is missing or owned by someone else.
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
