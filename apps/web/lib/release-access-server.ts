// The I/O wrapper around lib/release-access.ts's pure decision — the ONE
// team-aware access check every release-scoped route group calls.
//
// Contract (lib/release-access-guard.test.ts freezes the usage):
// - GET handlers call ensureReleaseTeamReadAccess; every other method calls
//   ensureReleaseTeamWriteAccess. Owner-only stays ONLY where it is a
//   recorded decision: the release row's own PATCH/DELETE, archive, schedule
//   (see ensureReleaseOwnership in app/api/releases/_shared.ts).
// - Visibility refusals are 404 { error: RELEASE_NOT_FOUND_MESSAGE } — never
//   403, so a non-member cannot learn the release exists.
// - Guest writes get buildReadOnlyResponse()'s 403 ("Your role in this
//   workspace is view-only.") — safe with lib/access-redirect.ts, which
//   intercepts 402 only, and surfaced verbatim by the scene toasts.
// - DB errors are plain 500s with the raw message. Deliberately NO
//   schema-missing translation here: environments are assumed migrated (the
//   credits route group's sanctioned contract), and this module must never
//   mention the deprecated fallback helpers by name.

import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

import { toReleaseSummary, type ReleaseSummary } from '@/lib/release-ops';
import { buildReadOnlyResponse, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { RELEASE_NOT_FOUND_MESSAGE, decideReleaseAccess } from '@/lib/release-access';

/**
 * ReleaseSummary plus the two fields the scene route groups need that the
 * shared summary historically dropped — release_date (content-posts month
 * resolution, recap) and artwork_asset_id (capture's graphic check). The
 * superset keeps the alias re-export in app/api/releases/_shared.ts
 * assignable everywhere the old ensureReleaseReadAccess return was consumed.
 */
export type ReleaseAccessSummary = ReleaseSummary & {
  releaseDate: string | null;
  artworkAssetId: string | null;
};

export type ReleaseAccessResult =
  | { error: NextResponse }
  | { release: ReleaseAccessSummary };

const RELEASE_ACCESS_COLUMNS =
  'id,owner_user_id,artist_id,artist_name,title,slug,release_date,status,description,artwork_asset_id,created_at,updated_at,deleted_at';

async function ensureReleaseAccess(
  adminClient: SupabaseClient | null,
  releaseId: string,
  user: User,
  write: boolean
): Promise<ReleaseAccessResult> {
  if (!adminClient) {
    return {
      error: NextResponse.json(
        { error: 'Server environment is not configured' },
        { status: 500 }
      ),
    };
  }

  const { data: release, error } = await adminClient
    .from('releases')
    .select(RELEASE_ACCESS_COLUMNS)
    .eq('id', releaseId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load rollout.' },
        { status: 500 }
      ),
    };
  }

  // A rollout in Trash is gone as far as every scene route is concerned.
  if (!release || (release as { deleted_at?: string | null }).deleted_at) {
    return {
      error: NextResponse.json({ error: RELEASE_NOT_FOUND_MESSAGE }, { status: 404 }),
    };
  }

  const row = release as Record<string, unknown>;
  const releaseOwnerId = String(row.owner_user_id || '');

  // Owner fast path: rule 1 of the pure decision, without the membership
  // queries — an owner's access never depends on their membership rows.
  if (!releaseOwnerId || releaseOwnerId !== user.id) {
    let decision: ReturnType<typeof decideReleaseAccess>;
    try {
      const access = await loadWorkspaceAccessContext(adminClient, user);
      decision = decideReleaseAccess({
        releaseOwnerId,
        releaseArtistId: String(row.artist_id || ''),
        releaseId: String(row.id || releaseId || ''),
        userId: user.id,
        access,
        write,
      });
    } catch {
      // Membership resolution failing must not escape as a bodyless 500 —
      // the scenes surface the JSON error field verbatim.
      return {
        error: NextResponse.json(
          { error: 'Could not check rollout access.' },
          { status: 500 }
        ),
      };
    }

    if (decision === 'not_found') {
      return {
        error: NextResponse.json({ error: RELEASE_NOT_FOUND_MESSAGE }, { status: 404 }),
      };
    }
    if (decision === 'read_only') {
      return { error: buildReadOnlyResponse() };
    }
  }

  return {
    release: {
      ...toReleaseSummary(row),
      releaseDate: row.release_date ? String(row.release_date) : null,
      artworkAssetId: row.artwork_asset_id ? String(row.artwork_asset_id) : null,
    },
  };
}

/** Owner OR any member of the owner's workspace (artist scope enforced). */
export async function ensureReleaseTeamReadAccess(
  adminClient: SupabaseClient | null,
  releaseId: string,
  user: User
): Promise<ReleaseAccessResult> {
  return ensureReleaseAccess(adminClient, releaseId, user, false);
}

/** Same visibility, plus guests (and unresolved roles) are refused 403. */
export async function ensureReleaseTeamWriteAccess(
  adminClient: SupabaseClient | null,
  releaseId: string,
  user: User
): Promise<ReleaseAccessResult> {
  return ensureReleaseAccess(adminClient, releaseId, user, true);
}
