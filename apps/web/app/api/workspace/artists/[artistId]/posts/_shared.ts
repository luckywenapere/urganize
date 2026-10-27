import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadWorkspaceAccessContext,
  loadWorkspaceMembers,
  requireAuthenticatedAdminOrInternal,
} from '@/lib/tasks-server';
import { listWorkspaceArtists } from '@/lib/artists-server';

// Shared by the posting plan routes (2026-10-27). Behind the same flags as the
// artist page, so a 404 when either is off. Opted into the internal actor
// because UrgAns's plan_posts tool calls these.

export const isPostingPlanOn = () =>
  process.env.NEXT_PUBLIC_FEATURE_ARTIST_PAGE === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

export type PostingScope = {
  adminClient: SupabaseClient;
  userId: string;
  workspaceId: string;
  artistName: string;
};

/** Auth, the caller's team, and the artist on that team's roster. */
export async function resolvePostingScope(
  request: NextRequest,
  artistId: string
): Promise<{ error: NextResponse } | PostingScope> {
  if (!isPostingPlanOn()) return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) };
  const auth = await requireAuthenticatedAdminOrInternal(request);
  if ('error' in auth) return { error: auth.error as NextResponse };
  if (!artistId) return { error: NextResponse.json({ error: 'Artist id is required.' }, { status: 400 }) };

  const { adminClient } = auth;
  const access = await loadWorkspaceAccessContext(adminClient, auth.user);
  const workspaceId = access.primaryWorkspaceId;
  if (!workspaceId) return { error: NextResponse.json({ error: 'Team not found.' }, { status: 404 }) };

  // An artist on another team reads exactly like one that does not exist.
  const roster = await listWorkspaceArtists(adminClient, workspaceId);
  const artist = roster.find((entry) => entry.id === artistId);
  if (!artist) return { error: NextResponse.json({ error: 'Artist not found.' }, { status: 404 }) };

  return { adminClient, userId: auth.user.id, workspaceId, artistName: artist.name };
}

/** People who can be named as "who posts": joined members of the team. */
export async function loadPosters(scope: PostingScope) {
  const members = await loadWorkspaceMembers(scope.adminClient, scope.workspaceId, scope.userId);
  return members
    .filter((member) => member.userId && member.status !== 'removed')
    .map((member) => ({ userId: member.userId as string, name: member.name }));
}
