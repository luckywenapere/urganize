import { SupabaseClient } from '@supabase/supabase-js';
import { normalizePipelineState } from '@/lib/release-execution';
import { ExecutionRelease } from '@/types/releases';

export class ReleaseService {
  constructor(private adminClient: SupabaseClient) {}

  async getReleasesForUser(userId: string) {
    const { data, error } = await this.adminClient
      .from('releases')
      .select('id,title,artist_name,release_date,description,status,state,readiness_score,created_at,updated_at')
      .or(`owner_user_id.eq.${userId},user_id.eq.${userId}`)
      .order('release_date', { ascending: true, nullsFirst: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: String(row.id || ''),
      title: String(row.title || 'Untitled release'),
      artistName: String(row.artist_name || 'Unknown artist'),
      releaseDate: row.release_date ? String(row.release_date) : null,
      description: row.description ? String(row.description) : null,
      status: String(row.status || 'draft') as any,
      state: normalizePipelineState(row.state),
      readinessScore: Number(row.readiness_score || 0),
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
      metadata: row.metadata || {},
    }));
  }
}
