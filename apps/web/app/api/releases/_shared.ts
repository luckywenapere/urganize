import { NextResponse } from 'next/server';
import { type SupabaseClient } from '@supabase/supabase-js';
import {
  ARTISTS_TABLE,
  COLLABORATORS_TABLE,
  RELEASE_COLLABORATORS_TABLE,
  RELEASE_EVENTS_TABLE,
  RELEASE_METADATA_TABLE,
  calculateReleaseReadiness,
  toReleaseSummary,
  type ReleaseMetadataSnapshot,
  type ReleaseSummary,
} from '@/lib/release-ops';
import { createAdminClient } from '@/app/api/_shared/auth';

export {
  ARTISTS_TABLE,
  COLLABORATORS_TABLE,
  RELEASE_COLLABORATORS_TABLE,
  RELEASE_EVENTS_TABLE,
  RELEASE_METADATA_TABLE,
  toReleaseSummary,
};

// Canonical auth helpers live in app/api/_shared/auth.ts; re-exported here
// so the many release route import sites stay stable.
export {
  getAuthenticatedUser,
  requireActiveAuthenticatedUser,
  requireAuthenticatedAdmin,
  requireActiveAuthenticatedUserOrInternal,
  requireAuthenticatedAdminOrInternal,
  createAdminClient,
} from '@/app/api/_shared/auth';

export const isOptionalTableMissingError = (error: unknown): boolean => {
  const code = String((error as { code?: string } | null)?.code || '').toUpperCase();
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('column') ||
    (message.includes('relation') && message.includes('does not exist'))
  );
};

// Schema-missing fallback. CLAUDE.md flags this pattern as deprecated for v1
// — we no longer return the bootstrap SQL inline (it was wrong post-Migration-2
// anyway, since it recreated the dropped owner-scoped unique index). The 501
// is kept for surfaces that still ask the helper to translate a missing-table
// error into a response, but it now points devs at the migrations directory
// rather than handing them stale DDL to paste.
export const buildMissingTableResponse = (details?: string) =>
  NextResponse.json(
    {
      error: 'Release operations tables are missing.',
      ...(details ? { details } : {}),
      hint: 'Apply pending migrations from supabase/migrations/ against this project.',
    },
    { status: 501 }
  );

export async function ensureReleaseOpsSchema(
  adminClient: ReturnType<typeof createAdminClient>
) {
  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const checks: Array<{ label: string; run: () => Promise<{ error: { message?: string } | null }> }> = [
    {
      label: 'releases columns',
      run: async () =>
        adminClient
          .from('releases')
          .select('id,owner_user_id,artist_id,artist_name,title,slug,release_date,status,description,created_at,updated_at')
          .limit(1),
    },
    {
      label: 'artists table',
      run: async () => adminClient.from(ARTISTS_TABLE).select('id,name,owner_user_id,slug,workspace_id').limit(1),
    },
    {
      label: 'collaborators table',
      run: async () =>
        adminClient.from(COLLABORATORS_TABLE).select('id,full_name,stage_name,email,phone,default_role').limit(1),
    },
    {
      label: 'release collaborators table',
      run: async () =>
        adminClient
          .from(RELEASE_COLLABORATORS_TABLE)
          .select('id,release_id,collaborator_id,role,created_at,updated_at')
          .limit(1),
    },
    {
      label: 'release metadata table',
      run: async () =>
        adminClient
          .from(RELEASE_METADATA_TABLE)
          .select('id,release_id,primary_artist_name,release_title,updated_at')
          .limit(1),
    },
    {
      label: 'release events table',
      run: async () =>
        adminClient.from(RELEASE_EVENTS_TABLE).select('id,release_id,type,payload_json,created_at').limit(1),
    },
  ];

  // The probes are independent reads, so they run together (2026-10-11: the
  // first rollout made during onboarding was waiting on six round trips in a
  // row). Results are still read in the listed order, so the first failing
  // check is the one reported, exactly as before.
  const results = await Promise.all(checks.map((check) => check.run()));
  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    const result = results[index];
    if (!result.error) continue;

    if (isOptionalTableMissingError(result.error)) {
      return {
        error: buildMissingTableResponse(`Schema validation failed at ${check.label}.`),
      };
    }

    return {
      error: NextResponse.json(
        { error: result.error.message || `Could not verify ${check.label}.` },
        { status: 500 }
      ),
    };
  }

  return { ready: true as const };
}

/**
 * OWNER-ONLY by recorded decision, not by accident: the release row itself
 * stays the owner's to change — its PATCH/DELETE, archive, and schedule.
 * Teammates work through activities and the scenes, whose route groups gate
 * through lib/release-access-server.ts's team-aware pair instead. Do not
 * reach for this helper in a new scene route group; the guard test
 * (lib/release-access-guard.test.ts) bans it there.
 */
export async function ensureReleaseOwnership(
  adminClient: ReturnType<typeof createAdminClient>,
  releaseId: string,
  userId: string
) {
  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const { data: release, error } = await adminClient
    .from('releases')
    .select('id,owner_user_id,artist_id,artist_name,title,slug,release_date,status,description,created_at,updated_at,deleted_at')
    .eq('id', releaseId)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingTableResponse() };
    }
    return { error: NextResponse.json({ error: error.message || 'Could not load rollout.' }, { status: 500 }) };
  }

  const ownerId = String(release?.owner_user_id || '');
  // Trash is reached only through the trash routes, never through this check.
  if (!release || ownerId !== userId || (release as { deleted_at?: string | null }).deleted_at) {
    return { error: NextResponse.json({ error: 'Rollout not found.' }, { status: 404 }) };
  }

  return { release: toReleaseSummary(release as Record<string, unknown>) };
}

// Read access for RELEASE detail — the canonical team-aware implementation
// moved to lib/release-access-server.ts (one team-read rule in the codebase);
// aliased here so the existing [releaseId] GET import site stays stable, the
// auth-consolidation precedent. Behavior delta, sanctioned ratchet direction:
// a missing-table error here is now a plain 500, not the deprecated 501.
export { ensureReleaseTeamReadAccess as ensureReleaseReadAccess } from '@/lib/release-access-server';

export const toMetadataSnapshot = (row: Record<string, unknown> | null | undefined): ReleaseMetadataSnapshot | null => {
  if (!row) return null;
  return {
    id: String(row.id || ''),
    releaseId: String(row.release_id || ''),
    isrc: String(row.isrc || ''),
    upc: String(row.upc || ''),
    iswc: String(row.iswc || ''),
    primaryArtistName: String(row.primary_artist_name || ''),
    releaseTitle: String(row.release_title || ''),
    genre: String(row.genre || ''),
    subgenre: String(row.subgenre || ''),
    labelName: String(row.label_name || ''),
    featuredArtists: String(row.featured_artists || ''),
    lyrics: String(row.lyrics || ''),
    language: String(row.language || ''),
    explicit: row.explicit === null || row.explicit === undefined ? null : Boolean(row.explicit),
    cLine: String(row.c_line || ''),
    pLine: String(row.p_line || ''),
    artworkUrl: String(row.artwork_url || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
};

export async function loadReleaseCommandCenterData(
  adminClient: SupabaseClient,
  release: ReleaseSummary
) {
  const [collaboratorsResult, metadataResult, metadataViewedResult] = await Promise.all([
    adminClient
      .from(RELEASE_COLLABORATORS_TABLE)
      .select('id,release_id,collaborator_id,role,created_at,updated_at, collaborators(id,full_name,stage_name,email,phone)')
      .eq('release_id', release.id)
      .order('created_at', { ascending: true }),
    adminClient.from(RELEASE_METADATA_TABLE).select('*').eq('release_id', release.id).maybeSingle(),
    adminClient
      .from(RELEASE_EVENTS_TABLE)
      .select('id,created_at')
      .eq('release_id', release.id)
      .eq('type', 'metadata_viewed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const error = collaboratorsResult.error || metadataResult.error || metadataViewedResult.error;
  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingTableResponse() };
    }
    return { error: NextResponse.json({ error: error.message || 'Could not load rollout data.' }, { status: 500 }) };
  }

  const collaboratorRows = Array.isArray(collaboratorsResult.data) ? collaboratorsResult.data : [];

  const collaborators = collaboratorRows.map((row) => {
    const collaboratorRecord = Array.isArray(row.collaborators) ? row.collaborators[0] : row.collaborators;
    return {
      id: String(row.id || ''),
      releaseId: String(row.release_id || ''),
      collaboratorId: String(row.collaborator_id || ''),
      role: String(row.role || 'other'),
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
      collaboratorName: String(collaboratorRecord?.full_name || ''),
      stageName: String(collaboratorRecord?.stage_name || ''),
      email: String(collaboratorRecord?.email || ''),
      phone: String(collaboratorRecord?.phone || ''),
    };
  });

  const metadata = toMetadataSnapshot((metadataResult.data || null) as Record<string, unknown> | null);
  const readiness = calculateReleaseReadiness({
    title: release.title,
    artistName: release.artistName,
    collaboratorCount: collaborators.length,
    submittedCount: collaborators.length,
    metadata,
    metadataViewed: Boolean(metadataViewedResult.data?.id),
  });

  return { collaborators, metadata, readiness };
}

// Shared PATCH/POST input validation. Lives here because Next.js route files
// may only export HTTP handlers + route config, so both releases routes
// import these instead of keeping per-route copies.

export const RELEASE_STATUSES = [
  'draft',
  'planning',
  'in_progress',
  'ready',
  'released',
  'archived',
] as const;

export function isValidReleaseStatus(value: string): boolean {
  return (RELEASE_STATUSES as readonly string[]).includes(value);
}

export function parseOptionalReleaseDate(value: string): { value: string | null; error?: string } {
  if (!value) {
    return { value: null };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { value: null, error: 'Release date must use YYYY-MM-DD format.' };
  }

  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return { value: null, error: 'Release date is invalid.' };
  }

  return { value };
}
