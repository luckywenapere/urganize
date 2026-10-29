import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { ARTISTS_TABLE, RELEASES_TABLE } from '@/lib/artists-server';
import { CATALOGUE_TABLE } from '@/lib/artist-import/server';
import { loadArtistPhotoUrls } from '@/lib/profile-photo-server';
import type { WorkspaceAccessContext } from '@/lib/tasks-server';
import {
  findDuplicatePairs,
  pairKey,
  type DuplicatePair,
  type MergeCandidate,
  type MergeSide,
} from '@/lib/artist-merge';

// Server side of joining duplicate artists (#865). The pairing rule is pure
// and lives in lib/artist-merge.ts; this reads the rows it needs and runs the
// join through the merge_artists function (migration 20261029180000), which
// moves everything in one transaction.

export const DISMISSALS_TABLE = 'artist_merge_dismissals';

/**
 * Only the team's owner and admins are asked, since a join removes an artist.
 * A teammate limited to one artist never is.
 */
export function canJoinArtists(access: WorkspaceAccessContext, user: Pick<User, 'id'>): boolean {
  const ownerId = access.primaryWorkspace?.ownerId;
  if (!ownerId || !access.primaryWorkspaceId) return false;
  if (access.artistScopeByWorkspaceId[access.primaryWorkspaceId]) return false;
  if (ownerId === user.id) return true;
  const role = access.memberRoleByOwnerId[ownerId];
  return role === 'owner' || role === 'admin';
}

function countBy(rows: Array<{ artist_id: unknown }> | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    const id = String(row.artist_id ?? '');
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** The look-alike pairs this team has not answered yet. Empty on any read failure. */
export async function loadDuplicatePairs(adminClient: SupabaseClient, workspaceId: string): Promise<DuplicatePair[]> {
  const artistsRead = await adminClient
    .from(ARTISTS_TABLE)
    .select('id,name,created_via,photo_path,created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (artistsRead.error || !Array.isArray(artistsRead.data) || artistsRead.data.length < 2) return [];

  const rows = artistsRead.data as Array<Record<string, unknown>>;
  const ids = rows.map((row) => String(row.id));

  const [releasesRead, catalogueRead, dismissalsRead] = await Promise.all([
    adminClient.from(RELEASES_TABLE).select('artist_id').in('artist_id', ids),
    adminClient.from(CATALOGUE_TABLE).select('artist_id').in('artist_id', ids),
    adminClient.from(DISMISSALS_TABLE).select('artist_a,artist_b').eq('workspace_id', workspaceId),
  ]);
  if (releasesRead.error || dismissalsRead.error) return [];

  const rollouts = countBy(releasesRead.data as Array<{ artist_id: unknown }>);
  const pastReleases = countBy(catalogueRead.error ? [] : (catalogueRead.data as Array<{ artist_id: unknown }>));
  const dismissed = new Set(
    ((dismissalsRead.data ?? []) as Array<{ artist_a: string; artist_b: string }>).map((row) =>
      pairKey(String(row.artist_a), String(row.artist_b))
    )
  );

  const candidates: MergeCandidate[] = rows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    createdVia: row.created_via === 'import' ? 'import' : 'manual',
    hasPhoto: typeof row.photo_path === 'string' && row.photo_path.length > 0,
    rollouts: rollouts.get(String(row.id)) ?? 0,
    createdAt: String(row.created_at ?? ''),
  }));

  const pairs = findDuplicatePairs(candidates, dismissed);
  if (pairs.length === 0) return [];

  const photos = await loadArtistPhotoUrls(
    adminClient,
    pairs.flatMap((pair) => [pair.keep.id, pair.drop.id])
  );
  const side = (artist: MergeCandidate): MergeSide => ({
    id: artist.id,
    name: artist.name,
    photoUrl: photos.get(artist.id) ?? null,
    rollouts: artist.rollouts,
    pastReleases: pastReleases.get(artist.id) ?? 0,
  });
  return pairs.map((pair) => ({ keep: side(pair.keep), drop: side(pair.drop) }));
}

/** Both ids must be on this team. Returns an error sentence, or null when joined. */
export async function joinArtists(
  adminClient: SupabaseClient,
  input: { workspaceId: string; keepId: string; dropId: string }
): Promise<string | null> {
  if (!input.keepId || !input.dropId || input.keepId === input.dropId) return 'Choose two different artists.';
  const both = await adminClient
    .from(ARTISTS_TABLE)
    .select('id')
    .eq('workspace_id', input.workspaceId)
    .in('id', [input.keepId, input.dropId]);
  if (both.error || (both.data ?? []).length !== 2) return 'Artist not found.';

  const { error } = await adminClient.rpc('merge_artists', { p_keep: input.keepId, p_drop: input.dropId });
  if (error) {
    console.error('[artist-merge] merge_artists failed:', error.message);
    return 'Could not join them. Try again.';
  }
  return null;
}

/** Remembers that two artists are different people, so the team is not asked again. */
export async function dismissArtistPair(
  adminClient: SupabaseClient,
  input: { workspaceId: string; userId: string; a: string; b: string }
): Promise<string | null> {
  if (!input.a || !input.b || input.a === input.b) return 'Choose two different artists.';
  const both = await adminClient
    .from(ARTISTS_TABLE)
    .select('id')
    .eq('workspace_id', input.workspaceId)
    .in('id', [input.a, input.b]);
  if (both.error || (both.data ?? []).length !== 2) return 'Artist not found.';

  const [artistA, artistB] = input.a < input.b ? [input.a, input.b] : [input.b, input.a];
  const { error } = await adminClient.from(DISMISSALS_TABLE).upsert(
    { artist_a: artistA, artist_b: artistB, workspace_id: input.workspaceId, dismissed_by: input.userId },
    { onConflict: 'artist_a,artist_b' }
  );
  return error ? 'Could not save that. Try again.' : null;
}
