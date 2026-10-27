import { NextRequest, NextResponse } from 'next/server';
import { loadWorkspaceAccessContext, requireAuthenticatedAdmin } from '@/lib/tasks-server';
import { listWorkspaceArtists } from '@/lib/artists-server';
import { addDays, lagosDay } from '@/lib/whatsapp/chase-rules';
import { nextPlannedPost, weekStart, weekSummary } from '@/lib/posting-plan';
import { listTeamPosts } from '@/lib/posting-plan-server';
import { isPostingPlanOn } from '../../artists/[artistId]/posts/_shared';

// Home's posting card (2026-10-27): today's posts across the team's artists,
// this week's count and the next one. Nothing planned this week or ahead means
// an empty answer, and Home draws nothing.

export async function GET(request: NextRequest) {
  if (!isPostingPlanOn()) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    const workspaceId = access.primaryWorkspaceId;
    if (!workspaceId) return NextResponse.json({ today: lagosDay(new Date()), posts: [] });

    const today = lagosDay(new Date());
    const monday = weekStart(today);
    const [posts, roster] = await Promise.all([
      listTeamPosts(adminClient, workspaceId, { from: monday, to: addDays(monday, 13) }),
      listWorkspaceArtists(adminClient, workspaceId),
    ]);
    const nameOf = new Map(roster.map((artist) => [artist.id, artist.name]));
    const withName = <T extends { artistId: string }>(post: T) => ({ ...post, artistName: nameOf.get(post.artistId) ?? 'Your artist' });

    const next = nextPlannedPost(posts, today);
    return NextResponse.json({
      today,
      posts: posts.filter((post) => post.postDay === today).map(withName),
      week: weekSummary(posts, today),
      next: next ? withName(next) : null,
    });
  } catch (error) {
    console.error('[posting-plan] today failed:', error);
    return NextResponse.json({ error: 'Could not load today’s posts.' }, { status: 500 });
  }
}
