import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeReleaseSlug } from '@/lib/release-ops';

export const ARTISTS_TABLE = 'artists';
export const RELEASES_TABLE = 'releases';
export const RELEASE_METADATA_TABLE = 'release_metadata';

export type WorkspaceArtist = {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  name: string;
  slug: string;
};

/**
 * Returns the workspace's single artist row, or null when none exists.
 *
 * Workspace-scoped artists are the Phase 1+2 model. The v1 UI soft-limits to
 * one artist per workspace; until a "many artists per workspace" UI lands,
 * callers should treat workspace_id as the unique key and use `.maybeSingle`
 * semantics. `.order('created_at')` is added so that, in the legacy state
 * where a workspace has multiple artists, we return the oldest one
 * deterministically rather than racing on physical row order.
 */
export async function getWorkspaceArtist(
  adminClient: SupabaseClient,
  workspaceId: string
): Promise<WorkspaceArtist | null> {
  const { data, error } = await adminClient
    .from(ARTISTS_TABLE)
    .select('id,workspace_id,owner_user_id,name,slug')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: String(data.id),
    workspaceId: String(data.workspace_id || ''),
    ownerUserId: String(data.owner_user_id || ''),
    name: String(data.name || ''),
    slug: String(data.slug || ''),
  };
}

type RenameResult = {
  artist: WorkspaceArtist;
  releasesUpdated: number;
};

type RenameOutcome = {
  data: RenameResult | null;
  error: string | null;
  /**
   * True when the rename was rejected because another artist row in the same
   * workspace already owns the target slug. Surfaced to the API so it can
   * return HTTP 409 instead of 400/500. Schema's partial unique index
   * (workspace_id, slug) WHERE workspace_id IS NOT NULL enforces this; the
   * pre-check below is a friendlier UX path, and the 23505 backstop covers
   * the race between SELECT and UPDATE.
   */
  conflict?: boolean;
};

/**
 * Renames an artist row and writes-through to every cached field that
 * denormalizes the artist name:
 *
 *   - artists.name (canonical)
 *   - artists.slug (derived from the new name)
 *   - releases.artist_name (denormalized cache on every release row)
 *   - release_metadata.primary_artist_name (denormalized cache on the
 *     metadata sidecar for every release)
 *
 * The caller is responsible for authorizing the action (workspace ownership
 * check). This helper does not consult RLS — it uses the service-role client
 * passed in. Idempotent: if the new name equals the current one, no row
 * mutations happen but the function still returns the canonical artist row.
 */
export async function renameWorkspaceArtist(
  adminClient: SupabaseClient,
  artistId: string,
  newName: string
): Promise<RenameOutcome> {
  const trimmed = newName.trim();
  if (!trimmed) {
    return { data: null, error: 'Artist name cannot be empty.' };
  }
  if (trimmed.length > 120) {
    return { data: null, error: 'Artist name must be 120 characters or fewer.' };
  }

  // Load current artist row so we can detect no-op and report the canonical
  // shape to the caller.
  const current = await adminClient
    .from(ARTISTS_TABLE)
    .select('id,workspace_id,owner_user_id,name,slug')
    .eq('id', artistId)
    .maybeSingle();

  if (current.error || !current.data) {
    return { data: null, error: 'Artist not found.' };
  }

  const currentRow = current.data;
  const nextSlug = normalizeReleaseSlug(trimmed) || `artist-${Date.now()}`;

  // No-op short-circuit. We still rebuild the cache projection so callers
  // get a consistent shape back.
  if (currentRow.name === trimmed && currentRow.slug === nextSlug) {
    return {
      data: {
        artist: {
          id: String(currentRow.id),
          workspaceId: String(currentRow.workspace_id || ''),
          ownerUserId: String(currentRow.owner_user_id || ''),
          name: String(currentRow.name || ''),
          slug: String(currentRow.slug || ''),
        },
        releasesUpdated: 0,
      },
      error: null,
    };
  }

  // Pre-check: would the new slug collide with a different artist in the
  // same workspace? The schema's partial unique index would catch this
  // anyway (23505 below), but checking first lets us return a friendly
  // message without consuming an UPDATE round-trip. Skipped when the slug
  // isn't changing (no-op shortcut already returned) and when the artist
  // has no workspace_id (rows excluded from the partial unique index).
  if (currentRow.workspace_id && currentRow.slug !== nextSlug) {
    const collision = await adminClient
      .from(ARTISTS_TABLE)
      .select('id,name')
      .eq('workspace_id', currentRow.workspace_id)
      .eq('slug', nextSlug)
      .neq('id', artistId)
      .maybeSingle();

    if (collision.data) {
      return {
        data: null,
        error: `An artist named "${trimmed}" already exists in this workspace.`,
        conflict: true,
      };
    }
    // collision.error (other than not-found) is swallowed intentionally —
    // the UPDATE will surface any real DB problem, and the 23505 backstop
    // below catches the unique-violation race.
  }

  // 1. Canonical update on artists.
  const updateArtist = await adminClient
    .from(ARTISTS_TABLE)
    .update({ name: trimmed, slug: nextSlug, updated_at: new Date().toISOString() })
    .eq('id', artistId)
    .select('id,workspace_id,owner_user_id,name,slug')
    .single();

  if (updateArtist.error || !updateArtist.data) {
    // Backstop for the SELECT→UPDATE race: another writer can insert a
    // colliding row between our pre-check and our UPDATE. Match by the
    // Postgres SQLSTATE code, not by the constraint name string — the
    // index name could be renamed in a future migration and we'd silently
    // start leaking raw DB text. 23505 = unique_violation.
    const updateErrorCode = String((updateArtist.error as { code?: string } | null)?.code || '');
    if (updateErrorCode === '23505') {
      return {
        data: null,
        error: `An artist named "${trimmed}" already exists in this workspace.`,
        conflict: true,
      };
    }
    return {
      data: null,
      error: updateArtist.error?.message || 'Could not rename artist.',
    };
  }

  // 2. Write-through to releases.artist_name. Returns the count of rows
  //    touched so the caller can surface it for debugging.
  const updateReleases = await adminClient
    .from(RELEASES_TABLE)
    .update({ artist_name: trimmed, updated_at: new Date().toISOString() })
    .eq('artist_id', artistId)
    .select('id');

  const releasesUpdated = Array.isArray(updateReleases.data) ? updateReleases.data.length : 0;

  // 3. Write-through to release_metadata.primary_artist_name for the same
  //    releases. Best-effort: if the metadata sidecar fails, we still keep
  //    the artists / releases updates — they're the user-visible read path.
  if (releasesUpdated > 0) {
    const releaseIds = (updateReleases.data || []).map((row) => String(row.id || ''));
    await adminClient
      .from(RELEASE_METADATA_TABLE)
      .update({ primary_artist_name: trimmed, updated_at: new Date().toISOString() })
      .in('release_id', releaseIds);
  }

  return {
    data: {
      artist: {
        id: String(updateArtist.data.id),
        workspaceId: String(updateArtist.data.workspace_id || ''),
        ownerUserId: String(updateArtist.data.owner_user_id || ''),
        name: String(updateArtist.data.name || ''),
        slug: String(updateArtist.data.slug || ''),
      },
      releasesUpdated,
    },
    error: null,
  };
}

/**
 * True when the workspace-consolidation feature flag is enabled at runtime.
 * Mirrors the inline `process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true'`
 * pattern used elsewhere (app/dashboard/page.tsx, the modal/topbar gates).
 * Centralized here so server routes can read it once and we have a single
 * point to flip when the flag retires.
 */
export const isWorkspaceFeatureEnabled = () =>
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';
