import { SupabaseClient } from '@supabase/supabase-js';
import { normalizePipelineState } from '@/lib/release-execution';
import { DEFAULT_RELEASE_TITLE, isDbReleaseType, type ReleaseStatus } from '@/types/releases';
import { loadCoverArtUrlMap, type ReleaseCoverInput } from '@/lib/cover-art';
import { loadWorkspaceLogoFallbackUrl } from '@/lib/workspace-logo';
import { readTemplatePending } from '@/lib/release-template-pending';

export class ReleaseService {
  constructor(private adminClient: SupabaseClient) {}

  /**
   * Releases visible to this user. `visibleOwnerIds` implements the
   * whole-workspace visibility model (founder decision, 2026-07-23): pass
   * the owners of every workspace the user belongs to
   * (WorkspaceAccessContext.releaseOwnerIds) and a teammate sees the whole
   * shared catalog. Omitted → owner-only, the pre-collaboration behavior.
   */
  async getReleasesForUser(
    userId: string,
    visibleOwnerIds?: string[],
    artistScopeByOwnerId?: Record<string, string>
  ) {
    const ownerIds = Array.from(
      new Set([userId, ...(visibleOwnerIds || [])].filter(Boolean))
    );
    const { data, error } = await this.adminClient
      .from('releases')
      .select(
        'id,owner_user_id,title,artist_id,artist_name,release_type,release_date,description,status,state,readiness_score,metadata,artwork_asset_id,created_at,updated_at'
      )
      .in('owner_user_id', ownerIds)
      .order('release_date', { ascending: true, nullsFirst: false });

    if (error) throw error;

    // Artist-scoped memberships (founder decision, 2026-07-23): an artist
    // invited to a manager's workspace only sees THEIR releases. Filtered
    // in JS — the per-owner OR-of-ANDs doesn't express cleanly in a single
    // PostgREST filter, and roster-scale row counts make this free.
    const scopeMap = artistScopeByOwnerId || {};
    const rows = (data || []).filter((row) => {
      const scope = scopeMap[String(row.owner_user_id || '')];
      if (!scope) return true;
      return String(row.artist_id || '') === scope;
    });

    // Resolve Phase 3 cover art (signed URLs) via the shared helper that
    // /api/releases also uses. Releases without artwork fall back to the
    // workspace logo (record label / team logo) when one is set, otherwise
    // workspace surfaces show the neutral placeholder; the legacy
    // release_metadata artwork_url fallback is intentionally not consulted
    // here (it's exclusive to /api/releases per the deprecation note in
    // release-ops.ts).
    const coverInput: ReleaseCoverInput[] = rows.map((row) => ({
      id: String(row.id || ''),
      artwork_asset_id:
        typeof row.artwork_asset_id === 'string' ? row.artwork_asset_id : null,
    }));
    // Independent lookups — run together. Serially they cost two round trips
    // on every dashboard load, which is the kind of latency that stacks up
    // badly on a slow mobile link.
    const [coverByReleaseId, workspaceLogoUrl] = await Promise.all([
      loadCoverArtUrlMap(this.adminClient, coverInput),
      loadWorkspaceLogoFallbackUrl(this.adminClient, userId),
    ]);

    return rows.map((row) => {
      const id = String(row.id || '');
      return {
        id,
        // Lets the client tell "mine" from "shared with me" — deletion (and
        // other owner-only affordances) hide on releases the user doesn't own.
        ownerUserId: String(row.owner_user_id || ''),
        title: String(row.title || DEFAULT_RELEASE_TITLE),
        artistId: String(row.artist_id || ''),
        artistName: String(row.artist_name || 'Unknown artist'),
        // Which playbook this release is planned from. Drives the per-type
        // activity-count and runway copy in SetReleaseDateCard and
        // NewReleaseGuide, which would otherwise quote the single template's
        // numbers at an EP.
        releaseType: isDbReleaseType(row.release_type) ? row.release_type : 'single',
        releaseDate: row.release_date ? String(row.release_date) : null,
        description: row.description ? String(row.description) : null,
        templatePending: readTemplatePending(row.metadata as Record<string, unknown> | null),
        status: String(row.status || 'draft') as ReleaseStatus,
        state: normalizePipelineState(row.state),
        readinessScore: Number(row.readiness_score || 0),
        createdAt: String(row.created_at || ''),
        updatedAt: String(row.updated_at || ''),
        metadata: row.metadata || {},
        coverArtUrl: coverByReleaseId.get(id) ?? workspaceLogoUrl,
      };
    });
  }
}
