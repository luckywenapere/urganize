// The posting plan, server side (SERVER-ONLY). Every call is already scoped to
// one team: routes resolve the caller's workspace and check the artist is on
// its roster before reaching here. Service role; artist_posts has no RLS
// policies, like the WhatsApp tables.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isPostPlatform, isPostStatus, type ArtistPost, type PostInput, type PostStatus } from '@/lib/posting-plan';

export const ARTIST_POSTS_TABLE = 'artist_posts';

const COLUMNS = 'id,artist_id,release_id,post_day,what,platform,owner_user_id,status,done_at';

type PostRow = {
  id: string;
  artist_id: string;
  release_id: string | null;
  post_day: string;
  what: string;
  platform: string | null;
  owner_user_id: string | null;
  status: string;
  done_at: string | null;
};

export function toArtistPost(row: PostRow): ArtistPost {
  return {
    id: row.id,
    artistId: row.artist_id,
    releaseId: row.release_id,
    postDay: String(row.post_day).slice(0, 10),
    what: row.what,
    platform: isPostPlatform(row.platform) ? row.platform : null,
    ownerUserId: row.owner_user_id,
    status: isPostStatus(row.status) ? row.status : 'planned',
    doneAt: row.done_at,
  };
}

export async function listArtistPosts(
  admin: SupabaseClient,
  workspaceId: string,
  artistId: string,
  range: { from: string; to: string }
): Promise<ArtistPost[]> {
  const { data, error } = await admin
    .from(ARTIST_POSTS_TABLE)
    .select(COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('artist_id', artistId)
    .gte('post_day', range.from)
    .lte('post_day', range.to)
    .order('post_day', { ascending: true });
  if (error) throw error;
  return ((data as PostRow[] | null) ?? []).map(toArtistPost);
}

/** Every post on the team in a day range, any artist (Home). */
export async function listTeamPosts(
  admin: SupabaseClient,
  workspaceId: string,
  range: { from: string; to: string }
): Promise<ArtistPost[]> {
  const { data, error } = await admin
    .from(ARTIST_POSTS_TABLE)
    .select(COLUMNS)
    .eq('workspace_id', workspaceId)
    .gte('post_day', range.from)
    .lte('post_day', range.to)
    .order('post_day', { ascending: true });
  if (error) throw error;
  return ((data as PostRow[] | null) ?? []).map(toArtistPost);
}

export async function createArtistPosts(
  admin: SupabaseClient,
  input: { workspaceId: string; artistId: string; createdBy: string; posts: PostInput[] }
): Promise<ArtistPost[]> {
  if (!input.posts.length) return [];
  const rows = input.posts.map((post) => ({
    workspace_id: input.workspaceId,
    artist_id: input.artistId,
    release_id: post.releaseId,
    post_day: post.postDay,
    what: post.what,
    platform: post.platform,
    // Who posts is whoever added it, unless they named someone.
    owner_user_id: post.ownerUserId ?? input.createdBy,
    created_by: input.createdBy,
  }));
  const { data, error } = await admin.from(ARTIST_POSTS_TABLE).insert(rows).select(COLUMNS);
  if (error) throw error;
  return ((data as PostRow[] | null) ?? []).map(toArtistPost);
}

export type PostPatch = Partial<PostInput> & { status?: PostStatus };

export async function updateArtistPost(
  admin: SupabaseClient,
  scope: { workspaceId: string; artistId: string; postId: string },
  patch: PostPatch
): Promise<ArtistPost | null> {
  const row: Record<string, unknown> = {};
  if (patch.what !== undefined) row.what = patch.what;
  if (patch.postDay !== undefined) row.post_day = patch.postDay;
  if (patch.platform !== undefined) row.platform = patch.platform;
  if (patch.ownerUserId !== undefined) row.owner_user_id = patch.ownerUserId;
  if (patch.releaseId !== undefined) row.release_id = patch.releaseId;
  if (patch.status !== undefined) {
    row.status = patch.status;
    row.done_at = patch.status === 'done' ? new Date().toISOString() : null;
  }
  const { data, error } = await admin
    .from(ARTIST_POSTS_TABLE)
    .update(row)
    .eq('id', scope.postId)
    .eq('workspace_id', scope.workspaceId)
    .eq('artist_id', scope.artistId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toArtistPost(data as PostRow) : null;
}

export async function deleteArtistPost(
  admin: SupabaseClient,
  scope: { workspaceId: string; artistId: string; postId: string }
): Promise<boolean> {
  const { data, error } = await admin
    .from(ARTIST_POSTS_TABLE)
    .delete()
    .eq('id', scope.postId)
    .eq('workspace_id', scope.workspaceId)
    .eq('artist_id', scope.artistId)
    .select('id');
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

/** Done or skipped from WhatsApp, only by the person who owns the post. */
export async function setPostStatusAsOwner(
  admin: SupabaseClient,
  postId: string,
  ownerUserId: string,
  status: PostStatus
): Promise<{ post: ArtistPost; workspaceId: string } | null> {
  const { data, error } = await admin
    .from(ARTIST_POSTS_TABLE)
    .update({ status, done_at: status === 'done' ? new Date().toISOString() : null })
    .eq('id', postId)
    .eq('owner_user_id', ownerUserId)
    .select(`${COLUMNS},workspace_id`)
    .maybeSingle();
  if (error || !data) return null;
  return { post: toArtistPost(data as PostRow), workspaceId: String((data as { workspace_id: string }).workspace_id) };
}
