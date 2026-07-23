import { SupabaseClient } from '@supabase/supabase-js';
import { normalizePipelineState } from '@/lib/release-execution';
import type { ReleaseStatus } from '@/types/releases';
import { loadCoverArtUrlMap, type ReleaseCoverInput } from '@/lib/cover-art';
import { loadWorkspaceLogoFallbackUrl } from '@/lib/workspace-logo';

export class ReleaseService {
  constructor(private adminClient: SupabaseClient) {}

  /**
   * Releases visible to this user. `visibleOwnerIds` implements the
   * whole-workspace visibility model (founder decision, 2026-07-23): pass
   * the owners of every workspace the user belongs to
   * (WorkspaceAccessContext.releaseOwnerIds) and a teammate sees the whole
   * shared catalog. Omitted → owner-only, the pre-collaboration behavior.
   */
  async getReleasesForUser(userId: string, visibleOwnerIds?: string[]) {
    const ownerIds = Array.from(
      new Set([userId, ...(visibleOwnerIds || [])].filter(Boolean))
    );
    const { data, error } = await this.adminClient
      .from('releases')
      .select(
        'id,title,artist_id,artist_name,release_date,description,status,state,readiness_score,metadata,artwork_asset_id,created_at,updated_at'
      )
      .in('owner_user_id', ownerIds)
      .order('release_date', { ascending: true, nullsFirst: false });

    if (error) throw error;

    const rows = data || [];

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
    const coverByReleaseId = await loadCoverArtUrlMap(this.adminClient, coverInput);
    const workspaceLogoUrl = await loadWorkspaceLogoFallbackUrl(this.adminClient, userId);

    return rows.map((row) => {
      const id = String(row.id || '');
      return {
        id,
        title: String(row.title || 'Untitled release'),
        artistId: String(row.artist_id || ''),
        artistName: String(row.artist_name || 'Unknown artist'),
        releaseDate: row.release_date ? String(row.release_date) : null,
        description: row.description ? String(row.description) : null,
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
